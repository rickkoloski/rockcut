defmodule RockcutApi.Authz do
  @moduledoc """
  Central authorization decisions for Rockcut.

  Tiers:
    * owner    — global; sees all departments, may assign any role
    * manager  — per-department; manages users within that department
    * employee — per-department; limited authority

  `role_in/2`, `member_of?/2`, and `can_manage_users_in?/2` answer
  department-scoped questions. `can?/3` is the action-aware entry point used to
  authorize operations on a resource; it takes the resource struct so per-item
  policy (e.g. D11 schedule `employee_write_scope`) can be consulted.

  A department may be given as a `%Department{}`, its integer id, or its string
  key (e.g. "brewery"). Key matching requires the user's memberships to be
  preloaded with `:department` (as `Accounts.get_user!/1` does).
  """
  alias RockcutApi.Accounts.{User, Membership, Department}

  @doc "True if the user is a global owner."
  def owner?(%User{is_owner: owner}), do: owner == true

  @doc """
  The user's role in a department: `:owner` (global), `:manager`, `:employee`,
  or `nil` when the user has no membership there.
  """
  def role_in(%User{is_owner: true}, _department), do: :owner

  def role_in(%User{} = user, department) do
    case Enum.find(memberships(user), &matches_department?(&1, department)) do
      %Membership{role: "manager"} -> :manager
      %Membership{role: "employee"} -> :employee
      _ -> nil
    end
  end

  @doc "True if the user is an owner or has any membership in the department."
  def member_of?(%User{} = user, department) do
    role_in(user, department) != nil
  end

  @doc "True if the user may manage users within the department (owner or its manager)."
  def can_manage_users_in?(%User{} = user, department) do
    role_in(user, department) in [:owner, :manager]
  end

  @doc """
  Authorize `action` (a verb atom such as `:read`, `:create`, `:update`,
  `:delete`) on `resource`. Owners may do anything; otherwise the resource's
  policy decides. Brewing resources belong to the Brewery module — any Brewery
  member may act on them (fine-grained verb policy arrives with later modules).
  """
  def can?(%User{is_owner: true}, _action, _resource), do: true

  def can?(%User{} = user, _action, %mod{} = _resource) do
    case Module.split(mod) do
      ["RockcutApi", "Brewing", _schema] -> member_of?(user, "brewery")
      _ -> false
    end
  end

  def can?(_user, _action, _resource), do: false

  ## Helpers

  defp memberships(%User{memberships: m}) when is_list(m), do: m
  defp memberships(_), do: []

  defp matches_department?(%Membership{department_id: id}, %Department{id: id}), do: true
  defp matches_department?(%Membership{department_id: id}, id) when is_integer(id), do: true

  defp matches_department?(%Membership{department: %Department{key: key}}, key)
       when is_binary(key),
       do: true

  defp matches_department?(%Membership{}, _), do: false
end
