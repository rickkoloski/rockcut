defmodule RockcutApi.Scheduling.ScheduleTemplate do
  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(week day)

  schema "schedule_templates" do
    field :name, :string
    field :kind, :string, default: "week"

    belongs_to :created_by, RockcutApi.Accounts.User
    has_many :items, RockcutApi.Scheduling.ScheduleTemplateItem, on_replace: :delete

    timestamps(type: :utc_datetime)
  end

  def changeset(template, attrs) do
    template
    |> cast(attrs, [:name, :kind, :created_by_id])
    |> validate_required([:name, :kind])
    |> validate_inclusion(:kind, @kinds)
    |> cast_assoc(:items, with: &RockcutApi.Scheduling.ScheduleTemplateItem.changeset/2)
  end
end
