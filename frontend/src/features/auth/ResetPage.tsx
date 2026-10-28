import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@mui/material/Button";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";

import { api, unwrap } from "@/shared/api/client";
import { errorMessage } from "@/shared/api/errors";

import styles from "./Auth.module.css";
import { AuthLayout } from "./AuthLayout";
import { FormTextField } from "./FormTextField";
import { ResultDialog } from "./ResultDialog";
import { emailSchema, type EmailValues } from "./schemas";

export default function ResetPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const reset = useMutation({
    mutationFn: (values: EmailValues) =>
      unwrap(api.POST("/api/v1/auth/password-reset", { body: values })),
  });

  return (
    <AuthLayout title="Reset Page" heading="Reset Password">
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            reset.mutate(values);
          })(event);
        }}
      >
        <FormTextField
          label="Email Address"
          type="email"
          autoComplete="email"
          registration={register("email")}
          error={errors.email}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          loading={reset.isPending}
          className={styles.submit}
        >
          Send Reset Link
        </Button>
        <div className={styles.links}>
          <Link to="/login" className={styles.link}>
            Remembered Password? Login
          </Link>
        </div>
      </form>

      <ResultDialog
        open={reset.isSuccess}
        kind="success"
        title="Reset Password Link Sent"
        actionLabel="Okay"
        onClose={() => void navigate("/login")}
      >
        {/* Worded so it doesn't reveal whether the email has an account. */}
        If an account exists for that email, we&apos;ve sent instructions to reset your password.
        Please check your email.
      </ResultDialog>
      <ResultDialog
        open={reset.isError}
        kind="error"
        title="Reset Process Failed"
        actionLabel="Okay"
        onClose={() => {
          reset.reset();
        }}
      >
        {errorMessage(reset.error)}
      </ResultDialog>
    </AuthLayout>
  );
}
