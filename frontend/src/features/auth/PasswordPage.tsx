import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@mui/material/Button";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";

import { api, unwrap } from "@/shared/api/client";
import { ApiError, errorMessage } from "@/shared/api/errors";
import { setSignedOut, useSession } from "@/shared/auth/store";

import styles from "./Auth.module.css";
import { AuthLayout } from "./AuthLayout";
import { FormTextField } from "./FormTextField";
import { ResultDialog } from "./ResultDialog";
import { newPasswordSchema, type NewPasswordValues } from "./schemas";

/** `/password/reset/confirm/:uid/:token`, the link in the password reset email. */
export default function PasswordPage() {
  const { uid = "", token = "" } = useParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const change = useMutation({
    mutationFn: async (values: NewPasswordValues) => {
      await unwrap(
        api.POST("/api/v1/auth/password-reset/confirm", {
          body: {
            uid,
            token,
            new_password: values.newPassword,
            re_new_password: values.confirmPassword,
          },
        }),
      );
      // The server ends every session of the account, including one in this browser.
      if (useSession.getState().status === "authenticated") setSignedOut();
    },
  });

  const linkExpired =
    change.error instanceof ApiError && change.error.code === "invalid_or_expired_link";

  return (
    <AuthLayout title="Password Page" heading="Change Password">
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            change.mutate(values);
          })(event);
        }}
      >
        <FormTextField
          label="New Password"
          type="password"
          autoComplete="new-password"
          registration={register("newPassword")}
          error={errors.newPassword}
        />
        <FormTextField
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          registration={register("confirmPassword")}
          error={errors.confirmPassword}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          loading={change.isPending}
          className={styles.submit}
        >
          Change
        </Button>
      </form>

      <ResultDialog
        open={change.isSuccess}
        kind="success"
        title="Password Changed!"
        actionLabel="Login"
        onClose={() => void navigate("/login")}
      >
        Password changed successfully. You can log in now.
      </ResultDialog>
      <ResultDialog
        open={change.isError}
        kind="error"
        title="Password Change Process Failed"
        actionLabel={linkExpired ? "Get a new link" : "Okay"}
        onClose={() => {
          if (linkExpired) void navigate("/reset-password");
          else change.reset();
        }}
      >
        {errorMessage(change.error)}
      </ResultDialog>
    </AuthLayout>
  );
}
