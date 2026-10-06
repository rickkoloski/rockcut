defmodule RockcutApi.StaffCodesTest do
  @moduledoc "D37 §3.2: staff codes (set, remove, reveal, resolve, eligibility, storage)."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Authz, Repo, StaffCodes, Tokens}
  alias RockcutApi.Accounts.{AuditEntry, User}

  setup do
    department_fixture("bar")
    department_fixture("brewery")

    %{
      owner: owner_fixture(),
      bar_mgr: user_with_role("manager", "bar"),
      bartender: user_with_role("employee", "bar", %{name: "Sam Pour"}),
      brewer: user_with_role("employee", "brewery"),
      brewery_mgr: user_with_role("manager", "brewery")
    }
  end

  defp audits(target, action) do
    Repo.all(
      from a in AuditEntry,
        where: a.target_id == ^target.id and a.action == ^action,
        order_by: a.id
    )
  end

  describe "set/3" do
    test "a Taproom manager sets a code; it's stored only as a digest and ciphertext", %{
      bar_mgr: mgr,
      bartender: b
    } do
      assert {:ok, user} = StaffCodes.set(b, "4821", mgr)
      assert user.staff_code_digest == Tokens.hash("4821")
      refute user.staff_code_encrypted =~ "4821"
      assert %DateTime{} = user.staff_code_set_at
      assert [%{actor_id: actor_id, detail: detail}] = audits(b, "staff_code.set")
      assert actor_id == mgr.id
      refute inspect(detail) =~ "4821"
    end

    test "an owner may set a code", %{owner: o, bartender: b} do
      assert {:ok, _} = StaffCodes.set(b, "0007", o)
      assert StaffCodes.resolve("0007").id == b.id
    end

    test "codes are unique: a code in use is refused", %{bar_mgr: mgr, bartender: b} do
      other = user_with_role("employee", "bar")
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      assert {:error, :code_in_use} = StaffCodes.set(other, "4821", mgr)
    end

    test "changing a code retires the old one immediately", %{bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "1111", mgr)
      {:ok, _} = StaffCodes.set(b, "2222", mgr)
      assert StaffCodes.resolve("1111") == nil
      assert StaffCodes.resolve("2222").id == b.id
    end

    test "only 4 digits", %{bar_mgr: mgr, bartender: b} do
      for bad <- ["123", "12345", "12a4", "", "    "] do
        assert {:error, :invalid_code} = StaffCodes.set(b, bad, mgr)
      end

      assert {:error, :invalid_code} = StaffCodes.set(b, 1234, mgr)
    end

    test "someone outside the Taproom can't hold a code (S3)", %{bar_mgr: mgr, brewer: brewer} do
      assert {:error, :not_eligible} = StaffCodes.set(brewer, "4821", mgr)
    end

    test "a shared device can't hold a code", %{owner: o} do
      assert {:error, :not_eligible} = StaffCodes.set(device_fixture(), "4821", o)
    end

    test "managers of other departments and employees can't set codes (S4)", %{
      brewery_mgr: bm,
      bartender: b
    } do
      other = user_with_role("employee", "bar")
      assert {:error, :forbidden} = StaffCodes.set(b, "4821", bm)
      assert {:error, :forbidden} = StaffCodes.set(other, "4821", b)
    end

    test "a device can't set codes", %{bartender: b} do
      assert {:error, :forbidden} = StaffCodes.set(b, "4821", device_fixture())
    end
  end

  describe "reveal/2 (the user dialog's eye toggle)" do
    test "decrypts the code and audits each reveal (S1)", %{bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      assert {:ok, "4821"} = StaffCodes.reveal(b, mgr)
      assert {:ok, "4821"} = StaffCodes.reveal(b, mgr)
      assert length(audits(b, "staff_code.reveal")) == 2
    end

    test "nil when there's no code, without an audit entry", %{bar_mgr: mgr, bartender: b} do
      assert {:ok, nil} = StaffCodes.reveal(b, mgr)
      assert audits(b, "staff_code.reveal") == []
    end

    test "forbidden to anyone but owners and Taproom managers (S4)", %{
      bar_mgr: mgr,
      bartender: b,
      brewery_mgr: bm
    } do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      other = user_with_role("employee", "bar")
      assert {:error, :forbidden} = StaffCodes.reveal(b, bm)
      assert {:error, :forbidden} = StaffCodes.reveal(b, other)
      assert {:ok, "4821"} = StaffCodes.reveal(b, owner_fixture())
    end
  end

  describe "remove/2" do
    test "clears the code and audits it", %{bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      assert {:ok, user} = StaffCodes.remove(b, mgr)
      refute StaffCodes.has_code?(user)
      assert StaffCodes.resolve("4821") == nil
      assert [_] = audits(b, "staff_code.remove")
    end

    test "forbidden to a manager of another department", %{
      bar_mgr: mgr,
      bartender: b,
      brewery_mgr: bm
    } do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      assert {:error, :forbidden} = StaffCodes.remove(b, bm)
    end
  end

  describe "resolve/1" do
    test "returns the person, memberships preloaded", %{bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      assert %User{} = person = StaffCodes.resolve(" 4821 ")
      assert person.id == b.id
      assert Authz.role_in(person, "bar") == :employee
    end

    test "nil for unknown or malformed codes" do
      assert StaffCodes.resolve("9999") == nil
      assert StaffCodes.resolve("abcd") == nil
      assert StaffCodes.resolve(nil) == nil
    end
  end

  describe "codes end when the person may no longer hold one" do
    test "deactivation clears the code", %{owner: o, bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      {:ok, _} = Accounts.update_user(b, %{"active" => false}, o)

      refute StaffCodes.has_code?(Accounts.get_user!(b.id))
      assert StaffCodes.resolve("4821") == nil
      assert [%{detail: %{"reason" => "ineligible"}}] = audits(b, "staff_code.remove")
    end

    test "leaving the Taproom clears the code (S12)", %{owner: o, bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)

      {:ok, _} =
        Accounts.set_memberships(b, [%{"department" => "brewery", "role" => "employee"}], o)

      refute StaffCodes.has_code?(Accounts.get_user!(b.id))
      assert StaffCodes.resolve("4821") == nil
    end

    test "other edits keep the code", %{owner: o, bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)
      {:ok, _} = Accounts.update_user(b, %{"name" => "Sam P."}, o)

      {:ok, _} =
        Accounts.set_memberships(
          b,
          [
            %{"department" => "bar", "role" => "employee"},
            %{"department" => "brewery", "role" => "employee"}
          ],
          o
        )

      assert StaffCodes.resolve("4821").id == b.id
      assert audits(b, "staff_code.remove") == []
    end
  end

  describe "suggest/0" do
    test "returns an unused 4-digit code", %{bar_mgr: mgr, bartender: b} do
      {:ok, _} = StaffCodes.set(b, "4821", mgr)

      for _ <- 1..50 do
        assert {:ok, code} = StaffCodes.suggest()
        assert code =~ ~r/^\d{4}$/
        refute code == "4821"
      end
    end
  end

  describe "encryption" do
    test "round-trips, and the ciphertext is bound to its user" do
      blob = StaffCodes.encrypt("4821", 1)
      assert StaffCodes.decrypt(blob, 1) == "4821"
      # Copied onto another user's row, it doesn't decrypt (the user id is AAD).
      assert StaffCodes.decrypt(blob, 2) == nil
      assert StaffCodes.decrypt("garbage", 1) == nil
    end

    test "a fresh IV each time" do
      refute StaffCodes.encrypt("4821", 1) == StaffCodes.encrypt("4821", 1)
    end
  end
end
