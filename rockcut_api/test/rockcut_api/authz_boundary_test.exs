defmodule RockcutApi.AuthzBoundaryTest do
  @moduledoc """
  D31: `RockcutApi.Authz` is the only place that turns the role model
  (`is_owner`, `memberships.role`, and since D33 the account `kind`) into an access decision. This test fails on
  any direct read of it elsewhere in `lib/`.

  Allowed: the files in `@allowlist`, and a line directly below a
  `# authz-boundary: data invariant` comment (a data rule, such as the
  last-owner guard, not an access decision).
  """
  use ExUnit.Case, async: true

  @root Path.expand("../..", __DIR__)

  # D33 adds the account kind: a device check (`.kind ==`, `kind: "device"`)
  # outside Authz is an access decision too.
  @pattern ~r/\.is_owner\b|is_owner: *true|\.role *==|role: *"manager"|role_in\(|managed_department_ids\(|member_of\?\(|can_manage_any\?\(|\.kind *(==|!=)|kind: *"(device|person)"/

  @allowlist [
    # The boundary itself.
    "lib/rockcut_api/authz.ex",
    # Schema field and its guarded changeset.
    "lib/rockcut_api/accounts/user.ex",
    # Serializes is_owner for the UI.
    "lib/rockcut_api_web/controllers/json_helpers.ex"
  ]

  @allowed_dirs ["lib/rockcut_api/seeds/"]

  @marker "# authz-boundary: data invariant"

  test "no direct role-model reads outside Authz" do
    violations =
      Path.wildcard(Path.join(@root, "lib/**/*.ex"))
      |> Enum.map(&Path.relative_to(&1, @root))
      |> Enum.reject(&allowed_file?/1)
      |> Enum.flat_map(&violations_in/1)

    assert violations == [],
           "Access decisions must go through RockcutApi.Authz (D31). Direct role-model reads:\n" <>
             Enum.map_join(violations, "\n", fn {file, line, text} ->
               "  #{file}:#{line}: #{String.trim(text)}"
             end) <>
             "\nIf a line is a data rule rather than an access decision, put `#{@marker}` on the line above it."
  end

  test "the pattern flags account-kind checks (D33)" do
    assert Regex.match?(@pattern, ~s|where: u.kind == "device"|)
    assert Regex.match?(@pattern, ~s|%User{kind: "device"} = user|)
    refute Regex.match?(@pattern, ~s|kind: "unavailable"|)
    refute Regex.match?(@pattern, ~s|kind: s.kind,|)
  end

  defp allowed_file?(file),
    do: file in @allowlist or Enum.any?(@allowed_dirs, &String.starts_with?(file, &1))

  defp violations_in(file) do
    lines = @root |> Path.join(file) |> File.read!() |> String.split("\n")

    lines
    |> Enum.with_index(1)
    |> Enum.filter(fn {text, n} ->
      Regex.match?(@pattern, text) and
        not (n > 1 and String.contains?(Enum.at(lines, n - 2), @marker))
    end)
    |> Enum.map(fn {text, n} -> {file, n, text} end)
  end
end
