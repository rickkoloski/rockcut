defmodule RockcutApi.BeerBoard do
  @moduledoc """
  The Buy-a-Beer Board (D37): pre-purchased beers moved off the taproom
  chalkboard, redeemed beer by beer. Every change writes a `beer_board_events`
  row in the same transaction.

  Callers authorize first (`Authz.can?(person, :write, :beer_board)`) and pass
  the acting **person** plus the shared `device` it came from (or `nil`).
  """
  import Ecto.Query, only: [from: 1, from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.BeerBoard.{Entry, Event}

  @history_page_size 50

  ## Reads

  @doc "Open entries, For A–Z (the UI re-sorts as asked)."
  def list_entries do
    Repo.all(from e in Entry, order_by: [asc: fragment("lower(?)", e.recipient_name), asc: e.id])
  end

  def get_entry(id), do: Repo.get(Entry, id)

  @doc """
  The change log, newest first, `@history_page_size` per page (1-based). `q`
  matches For or Bought by (case-insensitive substring). Actor and device
  preloaded. Returns `%{events: [...], page: n, total: count}`.
  """
  def list_events(q \\ nil, page \\ 1) do
    page = max(page, 1)
    base = from(ev in Event) |> search(q)

    events =
      Repo.all(
        from ev in base,
          order_by: [desc: ev.id],
          limit: @history_page_size,
          offset: ^((page - 1) * @history_page_size),
          preload: [:actor, :device]
      )

    %{events: events, page: page, total: Repo.aggregate(base, :count)}
  end

  defp search(query, q) when is_binary(q) and q != "" do
    like = "%" <> escape_like(normalize_name(q)) <> "%"

    from ev in query,
      where:
        fragment("lower(?) LIKE ? ESCAPE '\\'", ev.recipient_name, ^like) or
          fragment("lower(?) LIKE ? ESCAPE '\\'", ev.purchaser_name, ^like)
  end

  defp search(query, _), do: query

  defp escape_like(s), do: String.replace(s, ~r/[\\%_]/, fn c -> "\\" <> c end)

  @doc """
  The form names are matched in (search, import duplicates): trimmed, inner
  whitespace collapsed, lower-case.
  """
  def normalize_name(name) when is_binary(name),
    do: name |> String.trim() |> String.replace(~r/\s+/u, " ") |> String.downcase()

  ## Writes

  @doc "Record a chalkboard line. `attrs`: recipient_name, purchaser_name, beers."
  def create(attrs, %User{} = actor, device) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
    attrs = Map.put_new(attrs, "beers_remaining", attrs["beers"])

    changeset =
      %Entry{created_by_id: actor.id, moved_off_board_at: now()}
      |> Entry.changeset(attrs)

    Repo.transaction(fn ->
      case Repo.insert(changeset) do
        {:ok, entry} ->
          log!(entry, "created", actor, device, 0, entry.beers_remaining)
          entry

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc """
  Redeem `n` beers. The decrement is one conditional UPDATE, so two
  bartenders can't both pour the last beer. Returns `{:ok, entry}`,
  `{:ok, :removed}` (that was the last of it; the entry is deleted),
  `{:error, :not_found}`, `{:error, {:only, left}}` or `{:error, :invalid_count}`.
  """
  def redeem(id, n, %User{} = actor, device) do
    with {:ok, n} <- parse_count(n) do
      Repo.transaction(fn ->
        {updated, _} =
          Repo.update_all(
            from(e in Entry, where: e.id == ^id and e.beers_remaining >= ^n),
            inc: [beers_remaining: -n],
            set: [updated_at: now()]
          )

        case {updated, get_entry(id)} do
          {0, nil} ->
            Repo.rollback(:not_found)

          {0, entry} ->
            Repo.rollback({:only, entry.beers_remaining})

          {1, %Entry{beers_remaining: 0} = entry} ->
            log!(entry, "redeemed", actor, device, n, 0)
            Repo.delete!(entry)
            :removed

          {1, entry} ->
            log!(
              entry,
              "redeemed",
              actor,
              device,
              entry.beers_remaining + n,
              entry.beers_remaining
            )

            entry
        end
      end)
    end
  end

  @doc """
  Correct an entry: names and/or `beers_remaining` (1–99; to reach 0, redeem
  or delete). Returns `{:ok, entry}`, `{:error, :not_found}` or a changeset.
  """
  def update(id, attrs, %User{} = actor, device) do
    Repo.transaction(fn ->
      entry = get_entry(id) || Repo.rollback(:not_found)

      changeset =
        Entry.changeset(
          entry,
          Map.take(stringify(attrs), ~w(recipient_name purchaser_name beers_remaining))
        )

      case Repo.update(changeset) do
        {:ok, updated} ->
          if changeset.changes != %{} do
            log!(
              updated,
              "edited",
              actor,
              device,
              entry.beers_remaining,
              updated.beers_remaining,
              %{
                "from" => %{
                  "recipient_name" => entry.recipient_name,
                  "purchaser_name" => entry.purchaser_name
                },
                "to" => %{
                  "recipient_name" => updated.recipient_name,
                  "purchaser_name" => updated.purchaser_name
                }
              }
            )
          end

          updated

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Delete an entry. Returns `{:ok, :removed}` or `{:error, :not_found}`."
  def delete(id, %User{} = actor, device) do
    Repo.transaction(fn ->
      entry = get_entry(id) || Repo.rollback(:not_found)
      log!(entry, "deleted", actor, device, entry.beers_remaining, 0)
      Repo.delete!(entry)
      :removed
    end)
  end

  ## Helpers

  @doc false
  def log!(%Entry{} = entry, action, %User{} = actor, device, before, after_, detail \\ %{}) do
    Repo.insert!(%Event{
      entry_id: entry.id,
      action: action,
      actor_id: actor.id,
      device_id: device && device.id,
      recipient_name: entry.recipient_name,
      purchaser_name: entry.purchaser_name,
      beers_before: before,
      beers_after: after_,
      detail: detail
    })
  end

  defp parse_count(n) when is_integer(n) and n >= 1 and n <= 99, do: {:ok, n}

  defp parse_count(n) when is_binary(n) do
    case Integer.parse(n) do
      {i, ""} -> parse_count(i)
      _ -> {:error, :invalid_count}
    end
  end

  defp parse_count(nil), do: {:ok, 1}
  defp parse_count(_), do: {:error, :invalid_count}

  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
