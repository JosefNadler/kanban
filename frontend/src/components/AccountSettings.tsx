import { useState, type FormEvent } from "react";
import { ErrorText, errorText, Field, inputClass, Panel, PrimaryButton } from "@/components/ui";
import { changePassword, updateProfile, type User } from "@/lib/api";

type AccountSettingsProps = {
  token: string;
  user: User;
  onUserChange: (user: User) => void;
};

const SuccessText = ({ children }: { children: string | null }) =>
  children ? <p className="text-sm font-medium text-emerald-700">{children}</p> : null;

export const AccountSettings = ({ token, user, onUserChange }: AccountSettingsProps) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    try {
      onUserChange(await updateProfile(token, displayName.trim()));
      setProfileError(null);
      setProfileMessage("Profile saved.");
    } catch (error) {
      setProfileError(errorText(error, "Could not save profile."));
    }
  };

  const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    try {
      await changePassword(token, currentPassword, newPassword);
      setPasswordError(null);
      setPasswordMessage("Password changed. Other sessions were signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(errorText(error, "Could not change password."));
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 md:grid-cols-2">
      <Panel>
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Profile</h2>
        <p className="mt-1 text-sm text-[var(--gray-text)]">
          Signed in as @{user.username}
          {user.isAdmin ? " (admin)" : ""}.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleProfile(event)}>
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={60}
              className={inputClass}
            />
          </Field>
          <ErrorText>{profileError}</ErrorText>
          <SuccessText>{profileMessage}</SuccessText>
          <PrimaryButton type="submit">Save profile</PrimaryButton>
        </form>
      </Panel>

      <Panel>
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Change password</h2>
        <form className="mt-4 space-y-3" onSubmit={(event) => void handlePassword(event)}>
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>
          <ErrorText>{passwordError}</ErrorText>
          <SuccessText>{passwordMessage}</SuccessText>
          <PrimaryButton type="submit">Change password</PrimaryButton>
        </form>
      </Panel>
    </div>
  );
};
