defmodule RockcutApi.Yeast.StrainTypes do
  @moduledoc """
  D64 (spec Amendment 2, A13): the Strain Type list. Everyone who reads the
  yeast pages lists it; Brewery managers and owners change it (`Authz`
  `:yeast_settings`, the controller's check). A type in use (any strain
  names it) can be renamed or retired, not deleted (422); retiring keeps it
  on the strains that have it, and only active types are offered for a new
  pick.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Ingredient
  alias RockcutApi.Yeast.StrainType

  @in_use "Strains use this type, so it can't be deleted; retire it instead"

  @doc "Every type (retired ones too), by position then name, each with `in_use`."
  def list do
    counts =
      from(i in Ingredient,
        where: not is_nil(i.yeast_strain_type_id),
        group_by: i.yeast_strain_type_id,
        select: {i.yeast_strain_type_id, count(i.id)}
      )
      |> Repo.all()
      |> Map.new()

    from(t in StrainType, order_by: [t.position, t.name, t.id])
    |> Repo.all()
    |> Enum.map(&%{&1 | in_use: Map.get(counts, &1.id, 0)})
  end

  def get(id), do: Repo.get(StrainType, id)

  def create(attrs) do
    %StrainType{}
    |> StrainType.changeset(attrs)
    |> Repo.insert()
    |> with_use()
  end

  @doc "Rename, reorder, or retire (`active: false`) / restore (`active: true`)."
  def update(%StrainType{} = type, attrs) do
    changeset = StrainType.changeset(type, attrs)

    changeset =
      case Map.fetch(attrs, "active") do
        {:ok, active} when active in [false, "false"] ->
          Ecto.Changeset.put_change(
            changeset,
            :retired_at,
            type.retired_at || DateTime.truncate(DateTime.utc_now(), :second)
          )

        {:ok, active} when active in [true, "true"] ->
          Ecto.Changeset.put_change(changeset, :retired_at, nil)

        _ ->
          changeset
      end

    changeset |> Repo.update() |> with_use()
  end

  def delete(%StrainType{} = type) do
    if in_use?(type.id),
      do: {:error, {:invalid, %{base: [@in_use]}}},
      else: Repo.delete(type)
  end

  @doc """
  The type a strain may be given: nil, an active type, or the one it
  already has (retired or not). `:ok` or the 422.
  """
  def check_pick(nil, _current), do: :ok
  def check_pick(id, id), do: :ok

  def check_pick(id, _current) do
    case Repo.get(StrainType, id) do
      nil ->
        {:error, {:invalid, %{yeast_strain_type_id: ["does not exist"]}}}

      %StrainType{retired_at: nil} ->
        :ok

      %StrainType{name: name} ->
        {:error, {:invalid, %{yeast_strain_type_id: ["#{name} is retired"]}}}
    end
  end

  defp in_use?(id),
    do: Repo.exists?(from(i in Ingredient, where: i.yeast_strain_type_id == ^id))

  defp with_use({:ok, type}),
    do:
      {:ok,
       %{
         type
         | in_use:
             Repo.aggregate(
               from(i in Ingredient, where: i.yeast_strain_type_id == ^type.id),
               :count
             )
       }}

  defp with_use(error), do: error
end
