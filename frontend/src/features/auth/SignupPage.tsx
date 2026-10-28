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
import { signupSchema, type SignupValues } from "./schemas";

export default function SignupPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const signup = useMutation({
    mutationFn: (values: SignupValues) => unwrap(api.POST("/api/v1/auth/signup", { body: values })),
  });

  return (
    <AuthLayout title="Signup Page" heading="Signup">
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            signup.mutate(values);
          })(event);
        }}
      >
        <FormTextField
          label="Username"
          autoComplete="name"
          registration={register("name")}
          error={errors.name}
        />
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
          autoComplete="new-password"
          registration={register("password")}
          error={errors.password}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          loading={signup.isPending}
          className={styles.submit}
        >
          Signup
        </Button>
        <div className={styles.links}>
          <Link to="/login" className={styles.link}>
            Already have an account? Login
          </Link>
        </div>
      </form>

      <ResultDialog
        open={signup.isSuccess}
        kind="success"
        title="Signup Successful"
        actionLabel="Login"
        onClose={() => void navigate("/login")}
      >
        <span>Your account has been successfully created!</span>
        <span>A confirmation link has been sent to your email for account activation.</span>
        <span>Please check your email and follow the instructions to activate your account.</span>
      </ResultDialog>
      <ResultDialog
        open={signup.isError}
        kind="error"
        title="Signup Failed"
        actionLabel="Okay"
        onClose={() => {
          signup.reset();
        }}
      >
        {/* The server says exactly what's wrong: email taken, or a weak password. */}
        {errorMessage(signup.error)}
      </ResultDialog>
    </AuthLayout>
  );
}
