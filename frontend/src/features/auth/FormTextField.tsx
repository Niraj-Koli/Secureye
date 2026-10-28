import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

import styles from "./Auth.module.css";

interface FormTextFieldProps {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError | undefined;
  type?: "text" | "email" | "password";
  autoComplete: string;
}

/**
 * A react-hook-form field in the original style. Password fields get the show/hide toggle the
 * original had, with an accessible name.
 */
export function FormTextField({
  label,
  registration,
  error,
  type = "text",
  autoComplete,
}: FormTextFieldProps) {
  const [visible, setVisible] = useState(false);
  const { ref, ...field } = registration;
  const isPassword = type === "password";

  return (
    <TextField
      {...field}
      inputRef={ref}
      id={field.name}
      label={label}
      type={isPassword && visible ? "text" : type}
      autoComplete={autoComplete}
      required
      fullWidth
      margin="normal"
      className={styles.field}
      error={error !== undefined}
      helperText={error?.message}
      slotProps={{
        input: isPassword
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => {
                      setVisible((shown) => !shown);
                    }}
                  >
                    {visible ? (
                      <VisibilityOff className={styles.toggleIcon} />
                    ) : (
                      <Visibility className={styles.toggleIcon} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }
          : {},
      }}
    />
  );
}
