import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

import { useAuth } from "../contexts/AuthContext";
import { BRAND_PURPLE } from "../theme";

type Mode = "signin" | "signup";

export default function Login() {
  const { session, loading, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState<string | null>(null);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSignupNotice(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await signUp(email, password);

        if (signUpError) {
          setError(signUpError);
          return;
        }

        setSignupNotice(
          "Account created. If email confirmation is required, check your inbox before signing in."
        );
        setMode("signin");
      } else {
        const { error: signInError } = await signIn(email, password);

        if (signInError) {
          setError(signInError);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#F9FAFB",
        px: 2,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 2 }}>
            <Avatar sx={{ bgcolor: BRAND_PURPLE, width: 48, height: 48, fontWeight: 900, mb: 1.5 }}>
              D
            </Avatar>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              DUMAD STORE
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Engineering Stores Management
            </Typography>
          </Box>

          <Tabs
            value={mode}
            onChange={(_e, value: Mode) => {
              setMode(value);
              setError(null);
              setSignupNotice(null);
            }}
            variant="fullWidth"
            sx={{ mb: 2.5 }}
          >
            <Tab label="Sign In" value="signin" />
            <Tab label="Create Account" value="signup" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {signupNotice && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {signupNotice}
            </Alert>
          )}

          {mode === "signup" && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              Creating an account gives you a completely fresh workspace -
              your own Material Master, Location Master, and stock, separate
              from every other account.
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              autoComplete="email"
            />

            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              helperText={mode === "signup" ? "At least 6 characters." : undefined}
              slotProps={{ htmlInput: { minLength: 6 } }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={submitting}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              {submitting ? (
                <CircularProgress size={22} color="inherit" />
              ) : mode === "signup" ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
