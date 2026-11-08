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

  for actor <- [:owner, :manager], {label, shape} <- @shapes do
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

  # On create, null means no memberships (unchanged); on PUT it would mean "remove
  # all", so it is refused like the other shapes.
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
end
