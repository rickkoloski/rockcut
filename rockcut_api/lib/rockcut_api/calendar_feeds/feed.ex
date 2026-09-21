defmodule RockcutApi.CalendarFeeds.Feed do
  use Ecto.Schema

  schema "calendar_feeds" do
    field :token, :string
    field :subject_type, :string
    field :subject_id, :integer

    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end
end
