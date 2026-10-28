import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@mui/material/Button";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";

import { api, unwrap } from "@/shared/api/client";
import { ApiError, errorMessage } from "@/shared/api/errors";
import { safeNext, startSession } from "@/shared/auth/session";

import styles from "./Auth.module.css";
import { AuthLayout } from "./AuthLayout";
import { FormTextField } from "./FormTextField";
import { ResultDialog } from "./ResultDialog";
import { loginSchema, type LoginValues } from "./schemas";

function loginFailure(error: unknown): string {
  // Unknown email, wrong password and inactive account all get this (the server doesn't say which).
  if (error instanceof ApiError && error.code === "invalid_credentials") {
    return "Invalid email or password. Please try again.";
  }
  return errorMessage(error);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const tokens = await unwrap(api.POST("/api/v1/auth/login", { body: values }));
      await startSession(tokens.access_token);
    },
  });

  return (
    <AuthLayout title="Login Page" heading="Login">
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            login.mutate(values);
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
        <FormTextField
          label="Password"
          type="password"
          autoComplete="current-password"
          registration={register("password")}
          error={errors.password}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          loading={login.isPending}
          className={styles.submit}
        >
          Login
        </Button>
        <div className={styles.links}>
          <Link to="/reset-password" className={styles.link}>
            Forgot password?
          </Link>
          <Link to="/signup" className={styles.link}>
            Don&apos;t have an account? Signup
          </Link>
        </div>
      </form>

      <ResultDialog
        open={login.isSuccess}
        kind="success"
        title="Login Successful"
        actionLabel="Explore"
        onClose={() => void navigate(next, { replace: true })}
      >
        Welcome! You have successfully logged in.
      </ResultDialog>
      <ResultDialog
        open={login.isError}
        kind="error"
        title="Login Failed"
        actionLabel="Okay"
        onClose={() => {
          login.reset();
        }}
      >
        {loginFailure(login.error)}
      </ResultDialog>
    </AuthLayout>
  );
}
