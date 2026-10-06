import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AccountSettings } from "@/components/AccountSettings";
import { BoardMembers } from "@/components/BoardMembers";
import { UserAdmin } from "@/components/UserAdmin";
import { ApiError, type Member, type User } from "@/lib/api";

const api = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  setMember: vi.fn(),
  removeMember: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const me: User = { id: 1, username: "user", displayName: "Demo", isAdmin: true, createdAt: "2026-01-01 10:00:00" };
const bob: User = { id: 2, username: "bob", displayName: "Bob", isAdmin: false, createdAt: "2026-02-01 10:00:00" };

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("AccountSettings", () => {
  it("saves the display name", async () => {
    const onUserChange = vi.fn();
    api.updateProfile.mockResolvedValue({ ...me, displayName: "Josef" });
    render(<AccountSettings token="tok" user={me} onUserChange={onUserChange} />);

    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, " Josef ");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(api.updateProfile).toHaveBeenCalledWith("tok", "Josef");
    expect(onUserChange).toHaveBeenCalledWith({ ...me, displayName: "Josef" });
  });

  const fillPasswords = async (current: string, next: string, confirm: string) => {
    await userEvent.type(screen.getByLabelText("Current password"), current);
    await userEvent.type(screen.getByLabelText("New password"), next);
    await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
  };

  it("checks that new passwords match", async () => {
    render(<AccountSettings token="tok" user={me} onUserChange={() => {}} />);
    await fillPasswords("password", "new-password", "other-password");
    expect(screen.getByRole("alert")).toHaveTextContent("New passwords do not match.");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("changes the password and shows server errors", async () => {
    api.changePassword.mockRejectedValueOnce(new ApiError("Current password is incorrect.", 400));
    render(<AccountSettings token="tok" user={me} onUserChange={() => {}} />);
    await fillPasswords("wrong", "new-password", "new-password");
    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();

    api.changePassword.mockResolvedValueOnce(undefined);
    await userEvent.clear(screen.getByLabelText("Current password"));
    await userEvent.type(screen.getByLabelText("Current password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(api.changePassword).toHaveBeenLastCalledWith("tok", "password", "new-password");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });
});

describe("UserAdmin", () => {
  beforeEach(() => {
    api.listUsers.mockResolvedValue([bob, me]);
    api.createUser.mockResolvedValue(bob);
    api.updateUser.mockResolvedValue(bob);
    api.deleteUser.mockResolvedValue(undefined);
  });

  it("lists users and protects the current admin", async () => {
    render(<UserAdmin token="tok" currentUser={me} />);
    const selfRow = await screen.findByTestId("user-row-user");
    expect(within(selfRow).getByLabelText("Admin user")).toBeDisabled();
    expect(within(selfRow).getByRole("button", { name: "Delete user" })).toBeDisabled();
    expect(within(screen.getByTestId("user-row-bob")).getByText("2026-02-01")).toBeInTheDocument();
  });

  it("creates a user", async () => {
    render(<UserAdmin token="tok" currentUser={me} />);
    await screen.findByTestId("user-row-bob");
    await userEvent.type(screen.getByLabelText("Username"), "carol");
    await userEvent.type(screen.getByLabelText("Display name"), "Carol");
    await userEvent.type(screen.getByLabelText("Initial password"), "secret-pass");
    await userEvent.click(screen.getByLabelText("Administrator"));
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));

    await waitFor(() =>
      expect(api.createUser).toHaveBeenCalledWith("tok", {
        username: "carol",
        password: "secret-pass",
        displayName: "Carol",
        isAdmin: true,
      })
    );
    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  it("shows errors from user creation", async () => {
    api.createUser.mockRejectedValueOnce(new ApiError("Username is already taken.", 409));
    render(<UserAdmin token="tok" currentUser={me} />);
    await screen.findByTestId("user-row-bob");
    await userEvent.type(screen.getByLabelText("Username"), "bob");
    await userEvent.type(screen.getByLabelText("Initial password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByText("Username is already taken.")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("bob");
  });

  it("toggles admin, resets passwords and deletes users", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("reset-pass");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<UserAdmin token="tok" currentUser={me} />);
    const row = await screen.findByTestId("user-row-bob");

    await userEvent.click(within(row).getByLabelText("Admin bob"));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("tok", 2, { isAdmin: true }));

    await userEvent.click(within(row).getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenLastCalledWith("tok", 2, { password: "reset-pass" }));

    await userEvent.click(within(row).getByRole("button", { name: "Delete bob" }));
    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith("tok", 2));
  });
});

describe("BoardMembers", () => {
  const members: Member[] = [
    { username: "user", displayName: "Demo", role: "owner" },
    { username: "bob", displayName: "Bob", role: "viewer" },
  ];

  it("shares, changes roles and removes members", async () => {
    const onMembersChange = vi.fn();
    api.setMember.mockResolvedValue(members);
    api.removeMember.mockResolvedValue([members[0]]);
    render(<BoardMembers token="tok" boardId={4} members={members} canManage onMembersChange={onMembersChange} />);

    await userEvent.type(screen.getByLabelText("Share with username"), "carol");
    await userEvent.selectOptions(screen.getByLabelText("Share role"), "viewer");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(api.setMember).toHaveBeenCalledWith("tok", 4, "carol", "viewer"));
    expect(screen.getByLabelText("Share with username")).toHaveValue("");

    await userEvent.selectOptions(screen.getByLabelText("Role for bob"), "editor");
    await waitFor(() => expect(api.setMember).toHaveBeenLastCalledWith("tok", 4, "bob", "editor"));

    await userEvent.click(screen.getByRole("button", { name: "Remove bob" }));
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith("tok", 4, "bob"));
    expect(onMembersChange).toHaveBeenLastCalledWith([members[0]]);
  });

  it("shows sharing errors", async () => {
    api.setMember.mockRejectedValue(new ApiError("User not found.", 404));
    render(<BoardMembers token="tok" boardId={4} members={members} canManage onMembersChange={() => {}} />);
    await userEvent.type(screen.getByLabelText("Share with username"), "ghost");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("User not found.")).toBeInTheDocument();
  });

  it("is read-only for non-owners", () => {
    render(<BoardMembers token="tok" boardId={4} members={members} canManage={false} onMembersChange={() => {}} />);
    expect(screen.queryByLabelText("Share with username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Role for bob")).not.toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
  });
});
