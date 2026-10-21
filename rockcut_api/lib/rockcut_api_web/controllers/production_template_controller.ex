defmodule RockcutApiWeb.ProductionTemplateController do
  @moduledoc """
  D46 §3.4: process templates and their editor. Reads are `:read` on
  `:production`, changes `:setup`. Every change to a template's entries,
  links or ramps answers the whole template (entries in day order, links,
  `issues`), so the editor redraws from one response.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [process_template: 1, process_template_summary: 1]

  alias RockcutApi.{Authz, Production}
  alias RockcutApiWeb.ProductionErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/production/templates: active in order, then retired; with `step_count` and `issues`."
  def index(conn, _params) do
    with :ok <- allow(conn, :read) do
      render_list(conn, Production.list_templates())
    end
    |> ProductionErrors.handle(conn)
  end

  def show(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read),
         {:ok, template} <- fetch(id) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/templates: `{ name, notes? }`; starts with its Brew day."
  def create(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- Production.create_template(params) do
      conn |> put_status(:created) |> render_one(template)
    end
    |> ProductionErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, template} <- Production.update_template(template, params) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  def reorder(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, templates} <- Production.reorder_templates(params["ids"]) do
      render_list(conn, templates)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/templates/:id: retire."
  def retire(conn, %{"id" => id}), do: change(conn, id, &Production.retire_template/1)
  def restore(conn, %{"id" => id}), do: change(conn, id, &Production.restore_template/1)

  @doc "POST /api/production/templates/:id/duplicate: a deep copy, \"Copy of …\"."
  def duplicate(conn, %{"id" => id}) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, copy} <- Production.duplicate_template(template) do
      conn |> put_status(:created) |> render_one(copy)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/templates/:id/steps: a step (`step_type_id`) or phase
  marker (`phase_id` only), with `day_offset`, `vessel_index`, `detail`,
  `temperature`, `notes`, `on_task_list`, `comes_after_id` /
  `comes_after_answer`, `leads_to_id` / `leads_to_answer`.
  """
  def add_step(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, template} <- Production.add_step(template, entry_params(params)) do
      conn |> put_status(:created) |> render_one(template)
    end
    |> ProductionErrors.handle(conn)
  end

  def update_step(conn, %{"id" => id, "step_id" => step_id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, step} <- fetch_in(&Production.get_template_step/2, template, step_id),
         {:ok, template} <- Production.update_step(template, step, entry_params(params)) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  def remove_step(conn, %{"id" => id, "step_id" => step_id}) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, step} <- fetch_in(&Production.get_template_step/2, template, step_id),
         {:ok, template} <- Production.remove_step(template, step) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/templates/:id/links: `{ from_step_id, to_step_id, default_answer? }`."
  def add_link(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, template} <- Production.add_link(template, entry_params(params)) do
      conn |> put_status(:created) |> render_one(template)
    end
    |> ProductionErrors.handle(conn)
  end

  def update_link(conn, %{"id" => id, "link_id" => link_id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, link} <- fetch_in(&Production.get_template_link/2, template, link_id),
         {:ok, template} <-
           Production.update_link(template, link, Map.take(params, ["default_answer"])) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  def remove_link(conn, %{"id" => id, "link_id" => link_id}) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, link} <- fetch_in(&Production.get_template_link/2, template, link_id),
         {:ok, template} <- Production.remove_link(template, link) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/templates/:id/ramp: `{ start, target, change_per_day,
  first_day, vessel_index?, phase_id?, on_task_list?, comes_after_id?,
  leads_to_id? }`: one Set temp step per temperature, chained.
  """
  def add_ramp(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, template} <- Production.add_ramp(template, entry_params(params)) do
      conn |> put_status(:created) |> render_one(template)
    end
    |> ProductionErrors.handle(conn)
  end

  defp change(conn, id, fun) do
    with :ok <- allow(conn, :setup),
         {:ok, template} <- fetch(id),
         {:ok, template} <- fun.(template) do
      render_one(conn, template)
    end
    |> ProductionErrors.handle(conn)
  end

  # The route's ids aren't entry fields.
  defp entry_params(params), do: Map.drop(params, ["id", "step_id", "link_id"])

  defp render_list(conn, templates),
    do: json(conn, %{data: Enum.map(templates, &process_template_summary/1)})

  defp render_one(conn, template), do: json(conn, %{data: process_template(template)})

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :production),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp fetch(id) do
    case Production.get_template(id) do
      nil -> {:error, :not_found}
      t -> {:ok, t}
    end
  end

  defp fetch_in(get, template, id) do
    case get.(template, id) do
      nil -> {:error, :not_found}
      row -> {:ok, row}
    end
  end
end
