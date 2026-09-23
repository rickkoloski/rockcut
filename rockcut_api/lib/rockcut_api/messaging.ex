defmodule RockcutApi.Messaging do
  @moduledoc """
  Team messaging over pre-defined, derived channels (D23):

    * `"all"`            — All-staff (every active user)
    * `"managers"`       — Managers + owners
    * `"dept:<key>"`     — one per assignable department (members + owner may view)

  There is no channels table and no channel-membership table: the channel list and
  access are computed from a user's department memberships / manager status, so a
  user added to a department immediately sees that channel's full history.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Repo, Authz, Notifications}
  alias RockcutApi.Accounts.{User, Membership, Department}
  alias RockcutApi.Messaging.{Message, ChannelRead}

  @doc "Channels visible to `user`, as %{key, name, kind}, in display order."
  def channels_for(%User{} = user) do
    depts = assignable_departments()
    my_keys = if user.is_owner, do: Enum.map(depts, & &1.key), else: member_dept_keys(user)

    all = [%{key: "all", name: "All-staff", kind: "all"}]

    managers =
      if manager?(user), do: [%{key: "managers", name: "Managers", kind: "managers"}], else: []

    dept_channels =
      for d <- depts,
          d.key in my_keys,
          do: %{key: "dept:" <> d.key, name: d.name, kind: "department"}

    all ++ managers ++ dept_channels
  end

  def can_view?(%User{} = user, "all"), do: user.active
  def can_view?(%User{} = user, "managers"), do: manager?(user)

  def can_view?(%User{} = user, "dept:" <> dkey),
    do: dkey in assignable_keys() and (user.is_owner or dkey in member_dept_keys(user))

  def can_view?(_user, _key), do: false

  def can_post?(%User{} = user, key), do: can_view?(user, key)

  @doc "Recent messages in a channel (oldest→newest), or {:error, :forbidden}."
  def list_messages(%User{} = user, key, opts \\ []) do
    if can_view?(user, key) do
      limit = opts[:limit] || 100

      query =
        Message
        |> where([m], m.channel_key == ^key)
        |> order_by([m], desc: m.id)
        |> limit(^limit)
        |> preload(:user)

      query = if before = opts[:before], do: where(query, [m], m.id < ^before), else: query

      {:ok, query |> Repo.all() |> Enum.reverse()}
    else
      {:error, :forbidden}
    end
  end

  @doc "Post a message and notify the channel's other members (email/push)."
  def post_message(%User{} = user, key, body) do
    if can_post?(user, key) do
      case %Message{}
           |> Message.changeset(%{channel_key: key, user_id: user.id, body: body})
           |> Repo.insert() do
        {:ok, message} ->
          notify_members(user, key, message)
          {:ok, Repo.preload(message, :user)}

        error ->
          error
      end
    else
      {:error, :forbidden}
    end
  end

  @doc "Unread counts per visible channel: %{key => count} (excludes your own posts)."
  def unread_counts(%User{} = user) do
    reads =
      from(r in ChannelRead, where: r.user_id == ^user.id)
      |> Repo.all()
      |> Map.new(fn r -> {r.channel_key, r.last_read_message_id || 0} end)

    for %{key: key} <- channels_for(user), into: %{} do
      last_read = Map.get(reads, key, 0)

      count =
        Repo.one(
          from m in Message,
            where: m.channel_key == ^key and m.id > ^last_read and m.user_id != ^user.id,
            select: count(m.id)
        )

      {key, count}
    end
  end

  def total_unread(%User{} = user), do: user |> unread_counts() |> Map.values() |> Enum.sum()

  @doc "Mark a channel read up to its latest message."
  def mark_read(%User{} = user, key) do
    if can_view?(user, key) do
      max_id = Repo.one(from m in Message, where: m.channel_key == ^key, select: max(m.id)) || 0

      %ChannelRead{}
      |> ChannelRead.changeset(%{
        user_id: user.id,
        channel_key: key,
        last_read_message_id: max_id
      })
      |> Repo.insert(
        on_conflict: {:replace, [:last_read_message_id, :updated_at]},
        conflict_target: [:user_id, :channel_key]
      )

      :ok
    else
      {:error, :forbidden}
    end
  end

  @doc "The display name for a channel key."
  def channel_name("all"), do: "All-staff"
  def channel_name("managers"), do: "Managers"

  def channel_name("dept:" <> dkey) do
    case Repo.get_by(Department, key: dkey) do
      %Department{name: name} -> name
      _ -> dkey
    end
  end

  def channel_name(_), do: "Channel"

  ## Recipients (who to notify) — distinct from view access.

  def recipients("all"), do: active_users_query() |> Repo.all()

  def recipients("managers") do
    managers =
      from(u in User,
        join: m in Membership,
        on: m.user_id == u.id,
        where: u.active == true and m.role == "manager",
        distinct: true
      )
      |> Repo.all()

    owners = from(u in User, where: u.active == true and u.is_owner == true) |> Repo.all()
    Enum.uniq_by(managers ++ owners, & &1.id)
  end

  def recipients("dept:" <> dkey) do
    from(u in User,
      join: m in Membership,
      on: m.user_id == u.id,
      join: d in Department,
      on: d.id == m.department_id,
      where: u.active == true and d.key == ^dkey,
      distinct: true
    )
    |> Repo.all()
  end

  def recipients(_), do: []

  ## Internal

  defp notify_members(%User{} = author, key, %Message{} = message) do
    name = channel_name(key)
    preview = message.body |> String.slice(0, 140)
    author_name = author.name || author.email

    payload = %{
      title: "#{name}",
      body: "#{author_name}: #{preview}",
      data: %{"channel_key" => key, "message_id" => message.id, "url" => "/messages/#{key}"}
    }

    recipients =
      key |> recipients() |> Enum.reject(&(&1.id == author.id))

    Task.start(fn ->
      Enum.each(recipients, fn r ->
        try do
          Notifications.notify(r, :message_posted, payload)
        rescue
          e -> Logger.error("message notify failed: #{inspect(e)}")
        end
      end)
    end)
  end

  defp assignable_departments do
    from(d in Department, where: d.assignable == true, order_by: [asc: d.name]) |> Repo.all()
  end

  defp assignable_keys, do: assignable_departments() |> Enum.map(& &1.key)

  defp member_dept_keys(%User{} = user) do
    from(m in Membership,
      join: d in Department,
      on: d.id == m.department_id,
      where: m.user_id == ^user.id,
      select: d.key
    )
    |> Repo.all()
  end

  defp manager?(%User{} = user), do: Authz.can_manage_any?(user)

  defp active_users_query, do: from(u in User, where: u.active == true)
end
