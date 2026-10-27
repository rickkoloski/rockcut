defmodule RockcutApi.Production.Ramp do
  @moduledoc """
  D46 §3.4 / D48 §3.11: a Set temp ramp's arithmetic, for templates and
  batches alike (D48 lead decision 2). One Set temp step per temperature,
  one a day, from `start` stepping by the change per day toward `target`,
  the last reaching it exactly. The steps share a `ramp_group`.
  """
  alias RockcutApi.Production.TemplateStep

  @doc """
  `start`, `target` and `change_per_day` from `attrs` (string keys):
  `{:ok, %{start, target, change, temps}}`, or `{:error, :ramp_invalid}`
  (temperatures outside 28–80°F), `:ramp_flat` (start = target) or
  `{:ramp_change, gap}` (a change under 1° or over the gap).
  """
  def parse(attrs) do
    with {:ok, start} <- temperature(attrs["start"]),
         {:ok, target} <- temperature(attrs["target"]),
         true <- start != target || {:error, :ramp_flat},
         {:ok, change} <- change(attrs["change_per_day"], abs(start - target)),
         {:ok, temps} <- temperatures(start, target, change) do
      {:ok, %{start: start, target: target, change: change, temps: temps}}
    end
  end

  @doc "The temperatures of a ramp: `start` stepping by `change` toward `target`, ending on it."
  def temperatures(start, start, _change), do: {:error, :ramp_flat}

  def temperatures(start, target, change) when is_integer(change) and change > 0 do
    dir = if target < start, do: -1, else: 1

    temps =
      start
      |> Stream.iterate(&(&1 + dir * change))
      |> Enum.take_while(&(dir * (target - &1) > 0))

    {:ok, temps ++ [target]}
  end

  def temperatures(_start, _target, _change), do: {:error, :ramp_invalid}

  @doc "A whole temperature in 28–80°F (`:ramp_invalid` otherwise)."
  def temperature(value) do
    case to_int(value) do
      n when is_integer(n) ->
        if n in TemplateStep.temperatures(), do: {:ok, n}, else: {:error, :ramp_invalid}

      nil ->
        {:error, :ramp_invalid}
    end
  end

  @doc "A change per day from 1° to `gap` (`{:ramp_change, gap}` otherwise)."
  def change(value, gap) do
    case to_int(value) do
      n when is_integer(n) and n >= 1 and n <= gap -> {:ok, n}
      _ -> {:error, {:ramp_change, gap}}
    end
  end

  @doc "A new ramp group key."
  def new_group, do: "ramp-" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)

  defp to_int(i) when is_integer(i), do: i

  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, ""} -> i
      _ -> nil
    end
  end

  defp to_int(_), do: nil
end
