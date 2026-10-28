import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";

import { api, unwrap } from "@/shared/api/client";
import { ApiError, errorMessage } from "@/shared/api/errors";

import styles from "./Auth.module.css";
import { AuthLayout } from "./AuthLayout";
import { FormTextField } from "./FormTextField";
import { emailSchema, type EmailValues } from "./schemas";

type Outcome = "activated" | "already_active";

async function activate(uid: string, token: string): Promise<Outcome> {
  try {
    await unwrap(api.POST("/api/v1/auth/activate", { body: { uid, token } }));
    return "activated";
  } catch (error) {
    // Opening the link a second time: nothing to do, and nothing went wrong.
    if (error instanceof ApiError && error.code === "already_active") return "already_active";
    throw error;
  }
}

/**
 * `/activate/:uid/:token`, the link in the activation email. Unlike the original, which
 * navigated to /login straight away, it waits for the result and shows it.
 */
export default function ActivationPage() {
  const { uid = "", token = "" } = useParams();
  // A query rather than an effect: it runs once per link, even when React mounts the page twice
  // in development, and isn't repeated on refocus.
  const activation = useQuery({
    queryKey: ["activation", uid, token],
    queryFn: () => activate(uid, token),
    retry: false,
    staleTime: Infinity,
  });

  const linkInvalid =
    activation.error instanceof ApiError && activation.error.code === "invalid_or_expired_link";

  return (
    <AuthLayout title="Activation Page" heading="Activate Your Account">
      {activation.isPending && (
        <div className={styles.status} role="status">
          <CircularProgress color="inherit" size={37} aria-hidden />
          Activating your account…
        </div>
      )}

      {activation.isSuccess && (
        <>
          <p className={styles.message} role="status">
            {activation.data === "activated"
              ? "Your account is now active. You can log in."
              : "This account is already active. You can log in."}
          </p>
          <LoginButton />
        </>
      )}

      {activation.isError &&
        (linkInvalid ? (
          <ResendActivation />
        ) : (
          <>
            <p className={styles.message} role="alert">
              {errorMessage(activation.error)}
            </p>
            <Button
              variant="contained"
              size="large"
              fullWidth
              className={styles.submit}
              onClick={() => void activation.refetch()}
            >
              Try again
            </Button>
          </>
        ))}
    </AuthLayout>
  );
}

function LoginButton() {
  return (
    <Button
      component={Link}
      to="/login"
      variant="contained"
      size="large"
      fullWidth
      className={styles.submit}
    >
      Login
    </Button>
  );
}

/** Shown for an invalid or expired link: ask for a fresh one (new; the API always had this). */
function ResendActivation() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  const resend = useMutation({
    mutationFn: (values: EmailValues) =>
      unwrap(api.POST("/api/v1/auth/activate/resend", { body: values })),
  });

  if (resend.isSuccess) {
    return (
      <p className={styles.message} role="status">
        If that account still needs activating, we&apos;ve sent a new link. Please check your email.
      </p>
    );
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          resend.mutate(values);
        })(event);
      }}
    >
      <p className={styles.message} role="alert">
        This activation link is invalid or has expired. Enter your email to get a new one.
      </p>
      <FormTextField
        label="Email Address"
        type="email"
        autoComplete="email"
        registration={register("email")}
        error={errors.email}
      />
      {resend.isError && (
        <p className={styles.message} role="alert">
          {errorMessage(resend.error)}
        </p>
      )}
      <Button
        type="submit"
        variant="contained"
        size="large"
        fullWidth
        loading={resend.isPending}
        className={styles.submit}
      >
        Send New Link
      </Button>
    </form>
  );
}
