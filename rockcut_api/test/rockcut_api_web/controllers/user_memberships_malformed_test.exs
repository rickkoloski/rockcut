defmodule RockcutApiWeb.UserMembershipsMalformedTest do
  @moduledoc """
  D55 §2.4 (task 4983): malformed `memberships` is a 422 on `memberships`, not a
  500, for owners and managers; nothing is saved. `PUT /api/users/:id/memberships`
  shares the path.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  alias RockcutApi.Accounts
  alias RockcutApi.Accounts.User
  alias RockcutApi.Repo

  defp bearer(conn, user),
    do: put_req_header(conn, "authorization", "Bearer #{session_token_fixture(user)}")

  @shapes [
    {"a map", %{"department" => "brewery", "role" => "employee"}},
    {"a string", "brewery"},
    {"[null]", [nil]},
    {"a list of strings", ["brewery"]}
  ]

  defp email_saved?(email), do: Repo.get_by(User, email: email) != nil

  # Lead decisions 6, gap 7: `null` on create is refused as on update (left
  # out still means no roles).
  for actor <- [:owner, :manager], {label, shape} <- @shapes ++ [{"null", nil}] do
    @shape shape
    test "POST /api/users as #{actor}: memberships as #{label} -> 422, nothing saved", %{
      conn: conn
    } do
      actor =
        if unquote(actor) == :owner,
          do: owner_fixture(),
          else: user_with_role("manager", "brewery")

      email = "bad-#{System.unique_integer([:positive])}@rockcut.com"
      before = Repo.aggregate(User, :count)

      body =
        conn
        |> bearer(actor)
        |> put_req_header("content-type", "application/json")
        |> post(~p"/api/users", Jason.encode!(%{email: email, memberships: @shape}))
        |> json_response(422)

      assert [_msg] = body["errors"]["memberships"]
      refute email_saved?(email)
      assert Repo.aggregate(User, :count) == before
    end
  end

  test "POST /api/users form-encoded memberships -> 422, nothing saved", %{conn: conn} do
    owner = owner_fixture()
    department_fixture("brewery")

    for form <- [
          "email=form1%40rockcut.com&memberships=brewery",
          "email=form2%40rockcut.com&memberships[0][department]=brewery&memberships[0][role]=employee"
        ] do
      body =
        conn
        |> bearer(owner)
        |> put_req_header("content-type", "application/x-www-form-urlencoded")
        |> post(~p"/api/users", form)
        |> json_response(422)

      assert [_msg] = body["errors"]["memberships"]
    end

    refute email_saved?("form1@rockcut.com")
    refute email_saved?("form2@rockcut.com")
  end

  # On PUT, null would mean "remove all", so it is refused like the other shapes.
  for {label, shape} <- @shapes ++ [{"null", nil}] do
    @shape shape
    test "PUT /api/users/:id/memberships: #{label} -> 422, memberships unchanged", %{
      conn: conn
    } do
      owner = owner_fixture()
      target = user_with_role("employee", "brewery", %{email: "keep@rockcut.com"})

      body =
        conn
        |> bearer(owner)
        |> put_req_header("content-type", "application/json")
        |> put(~p"/api/users/#{target.id}/memberships", Jason.encode!(%{memberships: @shape}))
        |> json_response(422)

      assert [_msg] = body["errors"]["memberships"]

      assert [%{role: "employee", department: %{key: "brewery"}}] =
               Accounts.get_user!(target.id).memberships
    end
  end

  # D55 §2.11: a department id past SQLite's range is an unknown department
  # (422), not the driver's 500. `department` isn't an `*_id` key, so the
  # ParamIds plug doesn't see it; `Accounts` checks it with `RockcutApi.Ids`.
  for dept <- [99_999_999_999_999_999_999, "99999999999999999999"] do
    @dept dept
    test "memberships department #{inspect(dept)} -> 422 unknown department, nothing saved", %{
      conn: conn
    } do
      owner = owner_fixture()
      target = user_with_role("employee", "brewery", %{email: "keep@rockcut.com"})
      shape = [%{department: @dept, role: "employee"}]

      for {verb, path, body} <- [
            {:put, "/api/users/#{target.id}/memberships", %{memberships: shape}},
            {:post, "/api/users", %{email: "huge@rockcut.com", memberships: shape}}
          ] do
        resp =
          conn
          |> bearer(owner)
          |> put_req_header("content-type", "application/json")
          |> dispatch(@endpoint, verb, path, Jason.encode!(body))
          |> json_response(422)

        assert resp["errors"]["memberships"] == ["unknown department"]
      end

      refute email_saved?("huge@rockcut.com")

      assert [%{role: "employee", department: %{key: "brewery"}}] =
               Accounts.get_user!(target.id).memberships
    end
  end

  test "POST /api/users with memberships left out: no roles, 201", %{conn: conn} do
    owner = owner_fixture()

    body =
      conn
      |> bearer(owner)
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/users", Jason.encode!(%{email: "noroles@rockcut.com"}))
      |> json_response(201)

    assert Accounts.get_user!(body["data"]["id"]).memberships == []
  end

  # Lead decisions 6, gap 6: one department twice (by key or id, any roles) is a
  # 422 on `memberships`; it kept the first entry silently.
  test "a department named twice -> 422 on memberships, create and update, nothing saved", %{
    conn: conn
  } do
    owner = owner_fixture()
    target = user_with_role("employee", "brewery", %{email: "keep@rockcut.com"})
    brewery = Repo.get_by!(RockcutApi.Accounts.Department, key: "brewery")

    for shape <- [
          [%{department: "brewery", role: "manager"}, %{department: "brewery", role: "employee"}],
          [
            %{department: "brewery", role: "employee"},
            %{department: "brewery", role: "employee"}
          ],
          [%{department: "brewery", role: "manager"}, %{department: brewery.id, role: "employee"}]
        ],
        {verb, path, body} <- [
          {:put, "/api/users/#{target.id}/memberships", %{memberships: shape}},
          {:post, "/api/users", %{email: "twice@rockcut.com", memberships: shape}}
        ] do
      resp =
        conn
        |> bearer(owner)
        |> put_req_header("content-type", "application/json")
        |> dispatch(@endpoint, verb, path, Jason.encode!(body))
        |> json_response(422)

      assert resp["errors"]["memberships"] == ["names a department more than once"]
    end

    refute email_saved?("twice@rockcut.com")

    assert [%{role: "employee", department: %{key: "brewery"}}] =
             Accounts.get_user!(target.id).memberships
  end

  # Gap 7: an out-of-range `department_id` inside memberships is reported on
  # `memberships` (the ParamIds plug reports a nested id on its top-level key).
  test "an out-of-range department_id inside memberships -> 422 on memberships", %{conn: conn} do
    owner = owner_fixture()
    target = user_with_role("employee", "brewery", %{email: "keep@rockcut.com"})

    for {verb, path, body} <- [
          {:put, "/api/users/#{target.id}/memberships",
           %{memberships: [%{department_id: "99999999999999999999", role: "employee"}]}},
          {:post, "/api/users",
           %{
             email: "huge2@rockcut.com",
             memberships: [%{department_id: "99999999999999999999", role: "employee"}]
           }}
        ] do
      resp =
        conn
        |> bearer(owner)
        |> put_req_header("content-type", "application/json")
        |> dispatch(@endpoint, verb, path, Jason.encode!(body))
        |> json_response(422)

      assert resp["errors"] == %{"memberships" => ["is out of range"]}
    end

    refute email_saved?("huge2@rockcut.com")
  end
end
