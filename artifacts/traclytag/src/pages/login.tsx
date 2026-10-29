import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useLogin, useRegister, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  QrCode, Loader2, MapPin, Mail, Lock, User, Phone, 
  Building2, Globe, Fingerprint, Laptop, X, Check, 
  ExternalLink, RefreshCw, Terminal, TerminalSquare, ShieldAlert,
  Eye, EyeOff, KeyRound, Sparkles, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDevOptionsVisibility } from "@/hooks/use-dev-options-visibility";

const loginSchema = z.object({
  username: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
  location: z.string().optional(),
});

const signUpSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().trim().min(1, "Phone number is required"),
  companyName: z.string().trim().min(1, "Company Name is required"),
  companyEmail: z.string().trim().email("Invalid company email"),
  companyWebsiteUrl: z.string().trim().min(1, "Website URL is required"),
  location: z.string().trim().min(1, "Session location is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const { hideDevOptions, hideSsoOptions } = useDevOptionsVisibility();
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // --- Passkey States ---
  const [isPasskeySimulatorOpen, setIsPasskeySimulatorOpen] = useState(false);
  const [passkeyMode, setPasskeyMode] = useState<"login" | "register">("login");
  const [passkeyUsername, setPasskeyUsername] = useState("");
  const [passkeyOptions, setPasskeyOptions] = useState<any>(null);
  const [passkeyScanning, setPasskeyScanning] = useState(false);
  const [passkeySuccess, setPasskeySuccess] = useState(false);

  // --- Device Flow States ---
  const [isDeviceSimulatorOpen, setIsDeviceSimulatorOpen] = useState(false);
  const [deviceCode, setDeviceCode] = useState("");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [isDevicePolling, setIsDevicePolling] = useState(false);
  const [deviceLogs, setDeviceLogs] = useState<string[]>([]);
  const [deviceSuccess, setDeviceSuccess] = useState(false);
  const [deviceUser, setDeviceUser] = useState<any>(null);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // --- OTP States ---
  const [otpRequired, setOtpRequired] = useState(false);
  const [tempUserId, setTempUserId] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [simulatedOtp, setSimulatedOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [timer, setTimer] = useState(300);

  // --- Forgot / Reset Password States ---
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<"request" | "verify">("request");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string | null>(null);
  const [resetMaskedEmail, setResetMaskedEmail] = useState("");
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      setForgotPasswordError("Please enter your email or username");
      return;
    }
    setIsSendingReset(true);
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: resetIdentifier.trim() }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { error: text || "Network error occurred" }; }
      if (!res.ok) {
        throw new Error(data.error || "Failed to process request");
      }
      setResetMaskedEmail(data.email || "");
      setForgotPasswordSuccess(data.message || "Reset instructions sent to your email.");
      setForgotPasswordStep("verify");
      toast.success(data.message || "Reset instructions sent!");
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to send reset instructions");
      toast.error(err.message || "Error sending reset email");
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetOtpCode.trim()) {
      setForgotPasswordError("Please enter the 6-digit confirmation code from your email.");
      return;
    }
    if (resetNewPassword.length < 6) {
      setForgotPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setForgotPasswordError("Passwords do not match.");
      return;
    }
    setIsSubmittingReset(true);
    setForgotPasswordError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otpCode: resetOtpCode.trim(),
          newPassword: resetNewPassword,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { error: text || "Network error occurred" }; }
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password");
      }
      toast.success("Password reset successfully! You can now log in.");
      setIsForgotPasswordOpen(false);
      setForgotPasswordStep("request");
      loginForm.setValue("password", "");
      if (resetIdentifier) {
        loginForm.setValue("username", resetIdentifier);
      }
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to reset password");
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // --- SMTP Test States ---
  const [showSmtpTest, setShowSmtpTest] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpRecipient, setSmtpRecipient] = useState("");
  const [isSendingSmtpTest, setIsSendingSmtpTest] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpSuccess, setSmtpSuccess] = useState<string | null>(null);

  const handleSendSmtpTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpPassword || !smtpRecipient) {
      toast.error("Please fill in both fields");
      return;
    }
    setIsSendingSmtpTest(true);
    setSmtpError(null);
    setSmtpSuccess(null);
    try {
      const res = await fetch("/api/auth/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: smtpPassword, recipient: smtpRecipient })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send test email");
      }
      setSmtpSuccess(data.message || "Test email sent successfully!");
      toast.success("Test email sent successfully!");
    } catch (err: any) {
      setSmtpError(err.message || "An unknown error occurred");
      toast.error("Failed to send SMTP test email");
    } finally {
      setIsSendingSmtpTest(false);
    }
  };

  useEffect(() => {
    if (!otpRequired || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((t) => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpRequired, timer]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const maskEmail = (email: string) => {
    if (!email) return "";
    const [name, domain] = email.split("@");
    if (name.length <= 3) return `${name[0]}***@${domain}`;
    return `${name.slice(0, 3)}***@${domain}`;
  };

  const handleOtpChange = (val: string, index: number) => {
    if (val && !/^[0-9]$/.test(val)) return;
    
    let newOtp = enteredOtp.split("");
    newOtp[index] = val;
    const updated = newOtp.join("").slice(0, 6);
    setEnteredOtp(updated);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !enteredOtp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredOtp.length < 6) return;

    setIsVerifyingOtp(true);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: enteredOtp }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify OTP");
      }

      toast.success("OTP verified successfully!");
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      handleRedirect();
    } catch (err: any) {
      toast.error(err.message || "Incorrect OTP code. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = () => {
    const values = loginForm.getValues();
    onLoginSubmit(values);
  };


  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      location: "",
    },
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      phone: "",
      companyName: "",
      companyEmail: "",
      companyWebsiteUrl: "",
      location: "",
    },
  });

  // Autoscroll terminal logs
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [deviceLogs]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      const pollInterval = (window as any).devicePollInterval;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  const handleRedirect = () => {
    const redirect = sessionStorage.getItem("auth_redirect");
    if (redirect) {
      sessionStorage.removeItem("auth_redirect");
      setLocation(redirect);
    } else {
      setLocation("/dashboard");
    }
  };

  const fetchLocationAutomatically = (formType: "login" | "signUp") => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsFetchingLocation(true);
    toast.info("Fetching your location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { signal: controller.signal, headers: { "User-Agent": "TraclyTag-App" } }
          );

          clearTimeout(timeoutId);

          if (!response.ok) throw new Error("Geocoding failed");

          const data = await response.json();
          const address = data.display_name || 
            (data.address ? `${data.address.city || data.address.town || ""}, ${data.address.state || ""}, ${data.address.country || ""}`.trim() : null);

          if (address) {
            if (formType === "login") {
              loginForm.setValue("location", address);
            } else {
              signUpForm.setValue("location", address);
            }
            toast.success("Location auto-fetched successfully");
          } else {
            const coords = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            if (formType === "login") {
              loginForm.setValue("location", coords);
            } else {
              signUpForm.setValue("location", coords);
            }
            toast.success("Coordinates auto-fetched");
          }
        } catch (err) {
          const coords = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          if (formType === "login") {
            loginForm.setValue("location", coords);
          } else {
            signUpForm.setValue("location", coords);
          }
          toast.success("Coordinates fetched (Geocoding unavailable)");
        } finally {
          setIsFetchingLocation(false);
        }
      },
      (error) => {
        setIsFetchingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Location permission denied. Please enter manually.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Location information unavailable. Please enter manually.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out. Please enter manually.");
            break;
          default:
            toast.error("Failed to fetch location automatically.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  function onLoginSubmit(values: z.infer<typeof loginSchema>) {
    const loginData = {
      username: values.username.trim(),
      password: values.password,
    };
    loginMutation.mutate({ data: loginData }, {
      onSuccess: (data: any) => {
        if (data?.otpRequired) {
          setOtpRequired(true);
          setTempUserId(data.userId);
          setUserEmail(data.email);
          setSimulatedOtp(data.otpCode);
          setTimer(300);
          toast.info(`OTP sent! (Simulated: ${data.otpCode})`);
          return;
        }
        if (values.location) {
          localStorage.setItem("traclytag_login_location", values.location);
        } else {
          localStorage.removeItem("traclytag_login_location");
        }
        toast.success("Logged in successfully");
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        handleRedirect();
      },
      onError: (error: any) => {
        toast.error(error?.data?.error || "Invalid username/email or password");
      }
    });
  }

  function onSignUpSubmit(values: z.infer<typeof signUpSchema>) {
    const signUpData = {
      username: values.username.trim(),
      email: values.email.trim(),
      password: values.password,
      phone: values.phone.trim(),
      companyName: values.companyName.trim(),
      companyEmail: values.companyEmail.trim(),
      companyWebsiteUrl: values.companyWebsiteUrl.trim(),
    };
    registerMutation.mutate({ data: signUpData }, {
      onSuccess: () => {
        if (values.location) {
          localStorage.setItem("traclytag_login_location", values.location);
        } else {
          localStorage.removeItem("traclytag_login_location");
        }
        toast.success("Account & Company registered successfully");
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        handleRedirect();
      },
      onError: (error: any) => {
        toast.error(error?.data?.error || "Registration failed. Username may already exist.");
      }
    });
  }



  // --- Passkey Actions ---
  const handlePasskeyLogin = async (username: string) => {
    if (!username) {
      toast.error("Please enter your username to sign in with passkey.");
      return;
    }

    try {
      const optionsRes = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || "Failed to get passkey options");

      try {
        if (!navigator.credentials || !navigator.credentials.get) {
          throw new Error("WebAuthn not supported");
        }
        
        const challengeBuffer = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const allowCreds = options.allowCredentials.map((c: any) => ({
          id: Uint8Array.from(atob(c.id.replace(/-/g, "+").replace(/_/g, "/")), x => x.charCodeAt(0)),
          type: "public-key"
        }));

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: challengeBuffer,
            allowCredentials: allowCreds,
            timeout: options.timeout,
            rpId: options.rpId,
          }
        }) as PublicKeyCredential;

        if (assertion) {
          const response = assertion.response as AuthenticatorAssertionResponse;
          const loginVerifyBody = {
            loginResponse: {
              id: assertion.id,
              rawId: assertion.id,
              response: {
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
                authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
                signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
              },
              type: "public-key"
            },
            username,
            isSimulated: false
          };

          const verifyRes = await fetch("/api/auth/passkey/login-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginVerifyBody)
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verifyData.error || "Passkey validation failed");

          toast.success("Passkey login successful!");
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          handleRedirect();
          return;
        }
      } catch (webauthnErr: any) {
        console.warn("Native WebAuthn failed, falling back to simulator:", webauthnErr);
        setPasskeyOptions(options);
        setPasskeyUsername(username);
        setPasskeyMode("login");
        setPasskeySuccess(false);
        setIsPasskeySimulatorOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Passkey login failed");
    }
  };

  const handlePasskeyRegister = async (values: any) => {
    try {
      const optionsRes = await fetch("/api/auth/passkey/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.username }),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || "Failed to get registration options");

      try {
        if (!navigator.credentials || !navigator.credentials.create) {
          throw new Error("WebAuthn not supported");
        }

        const challengeBuffer = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const userBuffer = Uint8Array.from(atob(options.user.id), c => c.charCodeAt(0));

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge: challengeBuffer,
            rp: options.rp,
            user: {
              id: userBuffer,
              name: options.user.name,
              displayName: options.user.displayName,
            },
            pubKeyCredParams: options.pubKeyCredParams,
            timeout: options.timeout,
            attestation: options.attestation
          }
        }) as PublicKeyCredential;

        if (credential) {
          const response = credential.response as AuthenticatorAttestationResponse;
          const regVerifyBody = {
            registrationResponse: {
              id: credential.id,
              rawId: credential.id,
              response: {
                clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
                attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
              },
              type: "public-key"
            },
            userData: values,
            isSimulated: false
          };

          const verifyRes = await fetch("/api/auth/passkey/register-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(regVerifyBody),
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verifyData.error || "Passkey registration failed");

          toast.success("Registered and logged in with Passkey!");
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          handleRedirect();
          return;
        }
      } catch (webauthnErr) {
        console.warn("Native WebAuthn registration failed, falling back to simulator:", webauthnErr);
        setPasskeyOptions(options);
        setPasskeyUsername(values.username);
        setPasskeyMode("register");
        setPasskeySuccess(false);
        setIsPasskeySimulatorOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Passkey registration failed");
    }
  };

  const executeSimulatedPasskey = async () => {
    setPasskeyScanning(true);
    
    // Simulate biometric scan delay
    setTimeout(async () => {
      try {
        const mockCredId = `mock_cred_${Math.random().toString(36).substring(2, 10)}`;
        
        if (passkeyMode === "register") {
          const values = signUpForm.getValues();
          const regBody = {
            registrationResponse: {
              id: mockCredId,
              rawId: mockCredId,
              response: {},
              type: "public-key"
            },
            userData: {
              username: values.username,
              email: values.email,
              companyName: values.companyName,
              companyEmail: values.companyEmail,
              companyWebsiteUrl: values.companyWebsiteUrl,
            },
            isSimulated: true
          };

          const res = await fetch("/api/auth/passkey/register-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(regBody),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Registration verification failed");

          setPasskeySuccess(true);
          toast.success("Registered successfully using Biometric Passkey Simulator!");
          setTimeout(() => {
            setIsPasskeySimulatorOpen(false);
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            handleRedirect();
          }, 1000);
        } else {
          const loginBody = {
            loginResponse: {
              id: passkeyOptions.allowCredentials[0]?.id || "mock_cred_default",
              rawId: passkeyOptions.allowCredentials[0]?.id || "mock_cred_default",
              response: {},
              type: "public-key"
            },
            username: passkeyUsername,
            isSimulated: true
          };

          const res = await fetch("/api/auth/passkey/login-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginBody),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Login verification failed");

          setPasskeySuccess(true);
          toast.success("Authenticated successfully using Biometric Passkey Simulator!");
          setTimeout(() => {
            setIsPasskeySimulatorOpen(false);
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            handleRedirect();
          }, 1000);
        }
      } catch (err: any) {
        toast.error(err.message || "Biometric authentication failed");
      } finally {
        setPasskeyScanning(false);
      }
    }, 1800);
  };

  // --- Device Simulator Actions ---
  const addDeviceLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDeviceLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const startDeviceFlow = async () => {
    // Clear old poll intervals
    const existingInterval = (window as any).devicePollInterval;
    if (existingInterval) clearInterval(existingInterval);

    setDeviceLogs([]);
    setDeviceSuccess(false);
    setDeviceUser(null);
    addDeviceLog("Initializing OAuth 2.0 Device Flow...");

    try {
      const res = await fetch("/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "traclytag_terminal" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize device code");

      setDeviceCode(data.device_code);
      setUserCode(data.user_code);
      setVerificationUri(data.verification_uri);
      setIsDevicePolling(true);

      addDeviceLog("Device authorization request registered.");
      addDeviceLog(`User Code generated: ${data.user_code}`);
      addDeviceLog(`Link: ${data.verification_uri}`);
      addDeviceLog("Polling backend status at interval = 3s...");

      let attempts = 0;
      const intervalId = setInterval(async () => {
        attempts++;
        if (attempts > 100) {
          clearInterval(intervalId);
          setIsDevicePolling(false);
          addDeviceLog("ERROR: Code expired. Request timeout.");
          return;
        }

        try {
          const pollRes = await fetch("/api/auth/device/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: data.device_code }),
          });
          const pollData = await pollRes.json();

          if (pollRes.ok && pollData.status === "success") {
            clearInterval(intervalId);
            setIsDevicePolling(false);
            setDeviceSuccess(true);
            setDeviceUser(pollData.user);
            addDeviceLog("STATUS: APPROVED!");
            addDeviceLog(`Authorized under account: ${pollData.user.username}`);
            addDeviceLog("Establishing encrypted session token...");
            addDeviceLog("Syncing active tag buffer...");
            addDeviceLog("SUCCESS: Terminal linked successfully.");
            toast.success("Device linked successfully!");
            return;
          }

          if (pollData.error === "authorization_pending") {
            addDeviceLog("STATUS: AUTHORIZATION_PENDING...");
          } else if (pollData.error === "expired_token") {
            clearInterval(intervalId);
            setIsDevicePolling(false);
            addDeviceLog("STATUS: EXPIRED_TOKEN");
          } else if (pollData.error === "access_denied") {
            clearInterval(intervalId);
            setIsDevicePolling(false);
            addDeviceLog("STATUS: ACCESS_DENIED");
          }
        } catch (e) {
          addDeviceLog("Polling error, retrying...");
        }
      }, 3000);

      (window as any).devicePollInterval = intervalId;

    } catch (err: any) {
      addDeviceLog(`ERROR: ${err.message}`);
      toast.error(err.message || "Failed to start device flow");
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { y: 25, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 100 } }
  };

  return (
    <div className="relative h-screen w-full flex flex-col bg-midnight-navy text-white selection:bg-safety-blue selection:text-white overflow-y-auto overflow-x-hidden">
      {/* Technical Background Canvas */}
      <div className="fixed inset-0 industrial-grid pointer-events-none z-0"></div>
      <div className="fixed inset-0 bg-gradient-to-tr from-midnight-navy via-transparent to-midnight-navy opacity-60 pointer-events-none z-0"></div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <ThemeToggle />
      </div>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center relative z-10 px-4 md:px-8 py-4 md:py-6">
        <div className="w-full max-w-[440px]">
          {/* Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-lg overflow-hidden transition-all duration-300">
            <div className="p-5 md:p-6.5">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-6"
              >
                {/* Logo branding block */}
                <motion.div variants={itemVariants} className="flex flex-col items-center mb-3 w-full relative">
                  <div className="flex items-center gap-2 mb-1.5 justify-center">
                    <img src="/logo.png" alt="TracelyTag Logo" className="h-9 object-contain" />
                  </div>
                  <div className="h-px w-12 bg-safety-blue mb-3"></div>
                  <h1 className="text-sm font-bold text-midnight-navy dark:text-white uppercase tracking-widest">
                    {otpRequired ? "Security Code" : "Terminal Access"}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
                    {otpRequired 
                      ? `Enter the verification code sent to ${maskEmail(userEmail)}`
                      : authMode === "login" 
                        ? "Enter your credentials to access the security layer." 
                        : "Register your account and company details to get started."}
                  </p>
                  
                  {!hideDevOptions && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsDeviceSimulatorOpen(true);
                        startDeviceFlow();
                      }}
                      className="absolute right-0 top-0 h-8 text-[9px] rounded-full border-safety-blue/30 text-safety-blue hover:bg-safety-blue/10 bg-transparent cursor-pointer"
                    >
                      <Laptop className="h-3 w-3 mr-1" />
                      Device Sim
                    </Button>
                  )}
                </motion.div>

                {/* Forms Area */}
                <motion.div variants={itemVariants} className="w-full">
                  {otpRequired ? (
                    <motion.div
                      key="otp-card"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-6"
                    >
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded-full bg-safety-blue/10 border border-safety-blue/20 flex items-center justify-center text-safety-blue mx-auto">
                          <span className="material-symbols-outlined text-[24px]">lock</span>
                        </div>
                        <h2 className="text-lg font-bold text-midnight-navy dark:text-white">Enter Verification Code</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          We sent a 6-digit OTP code to <span className="font-semibold text-midnight-navy dark:text-slate-200">{maskEmail(userEmail)}</span>. It will expire in 5 minutes.
                        </p>
                      </div>

                      <form onSubmit={handleOtpSubmit} className="space-y-6">
                        <div className="flex justify-center gap-2">
                          {Array.from({ length: 6 }).map((_, idx) => (
                            <input
                              key={idx}
                              id={`otp-${idx}`}
                              type="text"
                              maxLength={1}
                              value={enteredOtp[idx] || ""}
                              onChange={(e) => handleOtpChange(e.target.value, idx)}
                              onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                              className="w-11 h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-center font-mono font-bold text-lg text-midnight-navy dark:text-white focus:border-safety-blue focus:ring-1 focus:ring-safety-blue outline-none transition-all"
                            />
                          ))}
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                          <span>Expires in: <span className="font-mono text-safety-blue font-semibold">{formatTime(timer)}</span></span>
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={timer > 0 || isVerifyingOtp}
                            className="text-safety-blue hover:text-safety-blue/80 font-bold transition-all disabled:opacity-40"
                          >
                            Resend Code
                          </button>
                        </div>

                        <div className="flex flex-col gap-2.5">
                          <Button
                            type="submit"
                            disabled={isVerifyingOtp || enteredOtp.length < 6}
                            className="w-full h-12 rounded-lg text-white bg-safety-blue hover:bg-primary transition-all shadow-sm text-sm font-semibold cursor-pointer active:scale-[0.98]"
                          >
                            {isVerifyingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Verify & Authenticate"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setOtpRequired(false);
                              setEnteredOtp("");
                            }}
                            className="w-full h-12 rounded-lg border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-midnight-navy dark:hover:text-white font-medium text-xs cursor-pointer"
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </motion.div>
                  ) : authMode === "login" ? (
                    <Form {...loginForm}>
                      <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                        <FormField
                          control={loginForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                <span className="material-symbols-outlined text-[14px]">account_circle</span>
                                EMAIL / USERNAME
                              </FormLabel>
                              <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                <FormControl>
                                  <Input 
                                    placeholder="sys_admin_01 or admin@tracelytag.com" 
                                    className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                    {...field} 
                                  />
                                </FormControl>
                              </div>
                              <FormMessage className="ml-1 text-[10px]" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <div className="flex justify-between items-center">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">lock</span>
                                  PASSWORD
                                </FormLabel>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsForgotPasswordOpen(true);
                                    setForgotPasswordStep("request");
                                    setForgotPasswordError(null);
                                    setForgotPasswordSuccess(null);
                                    const currentUsername = loginForm.getValues("username");
                                    if (currentUsername) setResetIdentifier(currentUsername);
                                  }}
                                  className="text-[11px] font-bold tracking-wider text-safety-blue hover:underline transition-all uppercase cursor-pointer"
                                >
                                  Forgot Password?
                                </button>
                              </div>
                              <div className="relative flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-3 gap-2 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                <FormControl>
                                  <Input 
                                    type={showPassword ? "text" : "password"} 
                                    placeholder="••••••••••••" 
                                    className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide flex-1 h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                    {...field} 
                                  />
                                </FormControl>
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((prev) => !prev)}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors cursor-pointer shrink-0 focus:outline-none flex items-center justify-center"
                                  title={showPassword ? "Hide password" : "Show password"}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              <FormMessage className="ml-1 text-[10px]" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={loginForm.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                SESSION LOCATION
                              </FormLabel>
                              <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-1 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                <FormControl>
                                  <Input 
                                    placeholder="Start location (optional)" 
                                    className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                    {...field} 
                                  />
                                </FormControl>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => fetchLocationAutomatically("login")}
                                  disabled={isFetchingLocation}
                                  title="Fetch Location Automatically"
                                  className="shrink-0 h-8 w-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                                >
                                  {isFetchingLocation ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-safety-blue" />
                                  ) : (
                                    <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400">my_location</span>
                                  )}
                                </Button>
                              </div>
                              <FormMessage className="ml-1 text-[10px]" />
                            </FormItem>
                          )}
                        />
                        
                        <div className="flex flex-col gap-2.5 mt-3">
                          <Button 
                            type="submit" 
                            className="w-full h-12 rounded-lg text-white bg-safety-blue hover:bg-primary transition-all shadow-sm text-sm font-semibold cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
                            disabled={loginMutation.isPending}
                          >
                            {loginMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                Sign In
                                <span className="material-symbols-outlined text-[18px]">login</span>
                              </>
                            )}
                          </Button>
                          {!hideDevOptions && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handlePasskeyLogin(loginForm.getValues("username"))}
                              className="w-full h-12 rounded-lg flex items-center justify-center gap-2 border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-safety-blue text-[18px]">fingerprint</span>
                              <span>Sign In with Passkey</span>
                            </Button>
                          )}
                        </div>



                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            onClick={() => setAuthMode("signup")}
                            className="font-body-sm text-xs text-slate-500 dark:text-slate-400 hover:text-midnight-navy dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            Need access? <span className="text-safety-blue font-bold">Create account</span>
                          </button>
                        </div>
                      </form>
                    </Form>
                  ) : (
                    <Form {...signUpForm}>
                      <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-4">
                        <div className="max-h-[300px] overflow-y-auto pr-1 space-y-4 scrollbar-thin">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-safety-blue border-b border-slate-100 dark:border-slate-800 pb-1 mb-2">User Credentials</div>
                          
                          <FormField
                            control={signUpForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">account_circle</span>
                                  Username
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      placeholder="Choose username" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">mail</span>
                                  Email
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      type="email" 
                                      placeholder="user@corp.com" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">lock</span>
                                  Password
                                </FormLabel>
                                <div className="relative flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-3 gap-2 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      type={showSignUpPassword ? "text" : "password"} 
                                      placeholder="Minimum 6 characters" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide flex-1 h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                  <button
                                    type="button"
                                    onClick={() => setShowSignUpPassword((prev) => !prev)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors cursor-pointer shrink-0 focus:outline-none flex items-center justify-center"
                                    title={showSignUpPassword ? "Hide password" : "Show password"}
                                  >
                                    {showSignUpPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">phone</span>
                                  Phone
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      placeholder="Enter phone number" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />

                          <div className="text-[10px] font-bold uppercase tracking-widest text-safety-blue border-b border-slate-100 dark:border-slate-800 pb-1 mb-2 mt-4">Company Details</div>

                          <FormField
                            control={signUpForm.control}
                            name="companyName"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">business</span>
                                  Company Name
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      placeholder="Acme Corporation" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="companyEmail"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">mail</span>
                                  Company Email
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      type="email" 
                                      placeholder="info@corp.com" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="companyWebsiteUrl"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">language</span>
                                  Website URL
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-2 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      placeholder="https://www.company.com" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={signUpForm.control}
                            name="location"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 uppercase">
                                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                                  Session Location
                                </FormLabel>
                                <div className="flex items-center w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-12 rounded-lg overflow-hidden pl-4 pr-1 gap-3 focus-within:border-safety-blue focus-within:ring-1 focus-within:ring-safety-blue/20 transition-all">
                                  <FormControl>
                                    <Input 
                                      placeholder="Enter session location" 
                                      className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm tracking-wide w-full h-full p-0 text-midnight-navy dark:text-white placeholder-slate-400" 
                                      {...field} 
                                    />
                                  </FormControl>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => fetchLocationAutomatically("signUp")}
                                    disabled={isFetchingLocation}
                                    title="Fetch Location Automatically"
                                    className="shrink-0 h-8 w-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                                  >
                                    {isFetchingLocation ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-safety-blue" />
                                    ) : (
                                      <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400">my_location</span>
                                    )}
                                  </Button>
                                </div>
                                <FormMessage className="ml-1 text-[10px]" />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <Button 
                            type="submit" 
                            className="w-full h-12 rounded-lg text-white bg-safety-blue hover:bg-primary transition-all shadow-sm text-xs font-semibold cursor-pointer active:scale-[0.98]"
                            disabled={registerMutation.isPending}
                          >
                            {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Register Company
                          </Button>
                          <Button 
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const values = signUpForm.getValues();
                              if (!values.username || !values.email || !values.companyName) {
                                toast.error("Please fill in Username, Email, and Company Name to register with a Passkey.");
                                return;
                              }
                              handlePasskeyRegister(values);
                            }}
                            className="w-full h-12 rounded-lg flex items-center justify-center gap-1.5 border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-safety-blue text-[18px]">fingerprint</span>
                            <span>Use Passkey</span>
                          </Button>
                        </div>



                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            onClick={() => setAuthMode("login")}
                            className="font-body-sm text-xs text-slate-500 dark:text-slate-400 hover:text-midnight-navy dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            Already registered? <span className="text-safety-blue font-bold">Sign In</span>
                          </button>
                        </div>
                      </form>
                    </Form>
                  )}
                </motion.div>

                {!hideDevOptions && (
                  <>
                    {/* Demo Credentials Footer */}
                    <motion.div 
                      variants={itemVariants}
                      className="bg-slate-50 dark:bg-slate-950 text-[9px] text-slate-500 dark:text-slate-400 flex flex-col items-start gap-1 p-2 rounded-lg border border-slate-200 dark:border-slate-850 mt-1.5"
                    >
                      <div className="font-semibold text-slate-700 dark:text-slate-300">Demo Credentials:</div>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-1 w-full text-[9px] font-mono">
                        <div>Supermaster: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-800 dark:text-white font-medium">supermaster</code> / <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-600 dark:text-slate-300">super123</code></div>
                        <div>Master: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-800 dark:text-white font-medium">master</code> / <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-600 dark:text-slate-300">master123</code></div>
                        <div>Admin: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-800 dark:text-white font-medium">demo_admin</code> / <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-600 dark:text-slate-300">admin123</code></div>
                        <div>Manager: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-800 dark:text-white font-medium">demo_manager</code> / <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-600 dark:text-slate-300">manager123</code></div>
                        <div>Operator: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-800 dark:text-white font-medium">demo_op</code> / <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded text-slate-600 dark:text-slate-300">op123</code></div>
                      </div>
                    </motion.div>

                    <div className="mt-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSmtpTest(!showSmtpTest);
                          setSmtpError(null);
                          setSmtpSuccess(null);
                        }}
                        className="text-[10px] font-semibold text-[#2563EB] hover:underline"
                      >
                        {showSmtpTest ? "Close SMTP Test Console" : "SMTP Connection Issues? Test SMTP"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {showSmtpTest && (
                        <motion.form 
                          onSubmit={handleSendSmtpTest}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-850 rounded-lg mt-3 space-y-3 flex flex-col text-left overflow-hidden"
                        >
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">SMTP Connection Test Panel</div>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Super Master Password</label>
                            <Input
                              type="password"
                              placeholder="Enter supermaster password"
                              value={smtpPassword}
                              onChange={(e) => setSmtpPassword(e.target.value)}
                              className="bg-white dark:bg-slate-900 text-xs py-1.5 h-8 border border-slate-200 dark:border-slate-850 rounded focus-visible:border-[#2563EB] focus-visible:ring-0"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Test Recipient Email</label>
                            <Input
                              type="email"
                              placeholder="recipient@example.com"
                              value={smtpRecipient}
                              onChange={(e) => setSmtpRecipient(e.target.value)}
                              className="bg-white dark:bg-slate-900 text-xs py-1.5 h-8 border border-slate-200 dark:border-slate-850 rounded focus-visible:border-[#2563EB] focus-visible:ring-0"
                            />
                          </div>

                          {smtpError && (
                            <div className="p-2 text-[10px] bg-red-50 text-red-700 border border-red-105 rounded leading-normal max-h-24 overflow-y-auto font-mono">
                              ⚠️ {smtpError}
                            </div>
                          )}

                          {smtpSuccess && (
                            <div className="p-2 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-105 rounded leading-normal font-mono">
                              ✅ {smtpSuccess}
                            </div>
                          )}

                          <Button
                            type="submit"
                            disabled={isSendingSmtpTest}
                            className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-semibold text-[11px] h-8 rounded mt-1 flex items-center justify-center gap-1.5"
                          >
                            {isSendingSmtpTest ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              "Send Test Email"
                            )}
                          </Button>
                        </motion.form>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {/* Security Validation Pills */}
                {!hideDevOptions && (
                  <div className="mt-3 pt-4 border-t border-slate-100 dark:border-slate-850 flex justify-center gap-4">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-850 rounded-full border border-slate-200 dark:border-slate-800">
                      <span className="material-symbols-outlined text-success-emerald text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">AES-256 ENCRYPTED</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-850 rounded-full border border-slate-200 dark:border-slate-800">
                      <span className="material-symbols-outlined text-warning-amber text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">GS1 COMPLIANT</span>
                    </div>
                  </div>
                )}

              </motion.div>
            </div>
          </div>

          {/* Global Status Indicator */}
          <div className="mt-4 flex justify-between items-center px-4 w-full max-w-[440px] text-white/50 text-[10px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-emerald opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success-emerald"></span>
              </span>
              <span>GLOBAL SYSTEM STATUS: NOMINAL</span>
            </div>
            <div>TZ: UTC+00:00</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto py-4 px-8 bg-slate-50 dark:bg-midnight-navy border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0">
          <span className="font-bold text-midnight-navy dark:text-white">TracelyTag</span>
          <span>© 2026 TracelyTag Industrial Intelligence. Secured by AES-255.</span>
        </div>
        <div className="flex gap-6 text-[10px] font-bold uppercase tracking-wider">
          <a href="#" className="hover:text-midnight-navy dark:hover:text-white transition-colors underline decoration-transparent hover:decoration-current">Security Protocol</a>
          <a href="#" className="hover:text-midnight-navy dark:hover:text-white transition-colors underline decoration-transparent hover:decoration-current">Privacy Policy</a>
          <a href="#" className="hover:text-midnight-navy dark:hover:text-white transition-colors underline decoration-transparent hover:decoration-current">System Status</a>
        </div>
      </footer>





      {/* --- Passkey Biometric Authenticator Simulator --- */}
      <AnimatePresence>
        {isPasskeySimulatorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card text-card-foreground border border-border rounded-3xl w-full max-w-sm shadow-2xl p-6 overflow-hidden text-center"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Biometric Passkey Authenticator</span>
                <Button variant="ghost" size="icon" onClick={() => setIsPasskeySimulatorOpen(false)} className="rounded-full h-7 w-7 hover:bg-muted">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="py-8 space-y-6">
                <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                  {/* Fingerprint glow pulses */}
                  <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping" style={{ animationDuration: "3s" }} />
                  <div className="absolute w-20 h-20 bg-indigo-500/20 rounded-full animate-pulse" />

                  <div className={`z-10 w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300 ${passkeySuccess ? "bg-green-500 text-white animate-bounce" : "bg-indigo-600 text-white"}`}>
                    {passkeyScanning ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : passkeySuccess ? (
                      <Check className="h-8 w-8" />
                    ) : (
                      <Fingerprint className="h-9 w-9" />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-bold text-lg text-foreground">
                    {passkeyScanning ? "Scanning Fingerprint..." : passkeySuccess ? "Authentication Successful!" : "Passkey Verification"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    {passkeyMode === "register" 
                      ? `Link new credentials for "${passkeyUsername}" to this device.` 
                      : `Approve credential request for user "${passkeyUsername}".`}
                  </p>
                </div>

                <div className="text-[10px] text-muted-foreground font-mono bg-muted p-2.5 rounded-xl border max-w-xs mx-auto text-left space-y-1">
                  <div>RP: <span className="text-foreground">TraclyTag ({passkeyOptions?.rpId || passkeyOptions?.rp?.id || "localhost"})</span></div>
                  <div>Challenge ID: <span className="text-foreground text-[8px] font-mono">{passkeyOptions?.challenge?.slice(0, 16)}...</span></div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsPasskeySimulatorOpen(false)} className="rounded-full w-full h-11 font-medium">
                  Cancel
                </Button>
                <Button
                  onClick={executeSimulatedPasskey}
                  disabled={passkeyScanning || passkeySuccess}
                  className="rounded-full w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/15"
                >
                  Verify Biometrics
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Device Flow Terminal Simulator (Sidebar Drawer) --- */}
      <AnimatePresence>
        {isDeviceSimulatorOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
            {/* Click outside backdrop to close */}
            <div className="absolute inset-0" onClick={() => setIsDeviceSimulatorOpen(false)} />
            
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative z-10 w-full max-w-lg bg-zinc-950 border-l border-zinc-800 text-zinc-300 flex flex-col h-full shadow-2xl"
            >
              {/* Terminal Header */}
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500/80 block" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/80 block" />
                    <span className="w-3 h-3 rounded-full bg-green-500/80 block" />
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-400 ml-2 flex items-center gap-1.5">
                    <TerminalSquare className="h-3.5 w-3.5 text-indigo-500" />
                    traclytag-cli@operator-terminal
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsDeviceSimulatorOpen(false)} 
                  className="rounded-full h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Terminal Shell Body */}
              <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-relaxed space-y-4">
                {/* Console Log outputs */}
                <div className="space-y-1 bg-black/40 p-3 rounded-xl border border-zinc-900 max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                  {deviceLogs.map((log, idx) => (
                    <div key={idx} className={log.includes("ERROR") ? "text-red-400" : log.includes("SUCCESS") || log.includes("APPROVED") ? "text-emerald-400" : log.includes("User Code") ? "text-indigo-400 font-bold" : "text-zinc-500"}>
                      {log}
                    </div>
                  ))}
                  <div ref={terminalBottomRef} />
                </div>

                {!deviceSuccess ? (
                  <div className="border border-zinc-800 bg-zinc-900/40 p-5 rounded-2xl space-y-4 text-center">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Authorization Required</span>
                    
                    <div className="flex flex-col items-center gap-3">
                      {/* Monospace user activation code */}
                      {userCode ? (
                        <div className="bg-black/80 text-indigo-400 text-3xl font-extrabold px-6 py-3 rounded-xl border border-indigo-500/30 tracking-widest shadow-inner select-all">
                          {userCode}
                        </div>
                      ) : (
                        <Loader2 className="h-7 w-7 animate-spin text-zinc-600" />
                      )}

                      <div className="text-xs text-zinc-400 max-w-xs leading-normal">
                        To register this device, enter the code above at the link below:
                        <a 
                          href="/activate" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="mt-1.5 text-indigo-400 hover:text-indigo-300 font-medium flex items-center justify-center gap-1 hover:underline"
                        >
                          /activate <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="relative flex items-center py-2">
                      <div className="flex-grow border-t border-zinc-800"></div>
                      <span className="flex-shrink mx-3 text-[8px] text-zinc-500 uppercase tracking-widest font-bold">Scanning QR Code</span>
                      <div className="flex-grow border-t border-zinc-800"></div>
                    </div>

                    {/* QR Code mockup */}
                    <div className="relative bg-white p-3 rounded-xl w-32 h-32 mx-auto border border-zinc-700 flex items-center justify-center group overflow-hidden">
                      <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="h-1 bg-indigo-500 w-full animate-pulse" />
                      </div>
                      <QrCode className="h-28 w-28 text-black" />
                    </div>

                    {isDevicePolling && (
                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                        <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" />
                        <span>Awaiting browser authorization...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Success Terminal Screen */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="border border-emerald-500/20 bg-emerald-950/15 p-5 rounded-2xl space-y-4"
                  >
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                      <Check className="h-4.5 w-4.5 bg-emerald-500/20 rounded-full p-0.5" />
                      <span>Operator Console Online</span>
                    </div>

                    <div className="text-zinc-400 text-xs leading-relaxed space-y-2">
                      <p>Hardware ID: <code className="bg-black/60 px-1 rounded text-zinc-200">tt-oper-0x4f82a</code></p>
                      <p>Linked User: <code className="bg-black/60 px-1 rounded text-zinc-200">{deviceUser?.username}</code></p>
                      <p>Organization: <code className="bg-black/60 px-1 rounded text-zinc-200">{deviceUser?.companyName || "N/A"}</code></p>
                    </div>

                    <div className="border border-zinc-800 bg-black/60 p-3 rounded-xl font-mono text-[9px] text-zinc-500 space-y-1">
                      <div className="text-emerald-400 font-bold mb-1">--- SIMULATED CLI OUTPUT ---</div>
                      <div>$ traclytag sync --verbose</div>
                      <div>[OK] Found 3 un-synchronized code batches.</div>
                      <div>[OK] Batch ID #104: Synced 50 codes (DataMatrix).</div>
                      <div>[OK] Batch ID #105: Synced 12 codes (DataMatrix).</div>
                      <div>[OK] Buffer synchronization completed successfully.</div>
                      <div className="text-emerald-500 animate-pulse mt-1">OPERATOR MODE: ACTIVE — STANDBY FOR CODING COMMANDS...</div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Terminal Footer */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-between items-center text-xs">
                <span className="text-zinc-500">Status: {deviceSuccess ? "Linked" : isDevicePolling ? "Polling" : "Offline"}</span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsDeviceSimulatorOpen(false);
                      // Clear poll interval
                      const existingInterval = (window as any).devicePollInterval;
                      if (existingInterval) clearInterval(existingInterval);
                      setIsDevicePolling(false);
                    }} 
                    className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full h-8 px-4 text-[10px]"
                  >
                    Close Terminal
                  </Button>
                  <Button
                    onClick={startDeviceFlow}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full h-8 px-4 text-[10px] font-semibold"
                  >
                    Restart Flow
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Forgot / Reset Password Modal */}
      <AnimatePresence>
        {isForgotPasswordOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-white relative"
            >
              <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500" />
              
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Password Recovery</h3>
                      <p className="text-[11px] text-slate-400">TracelyTag Security Protocol</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {forgotPasswordError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <span className="leading-relaxed">{forgotPasswordError}</span>
                  </div>
                )}

                {forgotPasswordStep === "request" ? (
                  <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter the username or email address associated with your account. We will send you recovery instructions and a secure authorization code.
                    </p>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                        Email or Username
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. supermaster or admin@company.com"
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white placeholder-slate-500 font-mono text-sm h-11 rounded-xl focus:border-blue-500"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="pt-2 flex gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsForgotPasswordOpen(false)}
                        className="flex-1 text-slate-400 hover:text-white border border-slate-800 rounded-xl h-11 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSendingReset}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-11 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                      >
                        {isSendingReset ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Dispatching...
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            Send Instructions
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                      <div>
                        Reset instructions sent{resetMaskedEmail ? ` to ${resetMaskedEmail}` : ""}. 
                        You can reset directly below using your 6-digit code or click the email link.
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                        6-Digit Confirmation Code
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. 583921"
                        value={resetOtpCode}
                        onChange={(e) => setResetOtpCode(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white placeholder-slate-500 font-mono text-center tracking-widest text-lg h-11 rounded-xl focus:border-blue-500"
                        required
                        maxLength={6}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                        New Password
                      </label>
                      <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-blue-500">
                        <Input
                          type={showResetNewPassword ? "text" : "password"}
                          placeholder="••••••••••••"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          className="bg-transparent border-0 text-white font-mono text-sm h-11 flex-1 px-3.5"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                          className="text-slate-400 hover:text-slate-200 p-2.5 transition-colors focus:outline-none"
                        >
                          {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                        Confirm New Password
                      </label>
                      <Input
                        type={showResetNewPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white font-mono text-sm h-11 rounded-xl focus:border-blue-500"
                        required
                        minLength={6}
                      />
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <Button
                        type="submit"
                        disabled={isSubmittingReset || resetNewPassword.length < 6 || resetNewPassword !== resetConfirmPassword}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-11 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
                      >
                        {isSubmittingReset ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Updating Password...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Update Password & Sign In
                          </>
                        )}
                      </Button>

                      <div className="flex justify-between items-center text-[11px] pt-1 text-slate-400">
                        <button
                          type="button"
                          onClick={() => setForgotPasswordStep("request")}
                          className="hover:text-white underline cursor-pointer"
                        >
                          Didn't get code? Resend
                        </button>
                        <a
                          href={`/reset-password${resetOtpCode ? `?code=${encodeURIComponent(resetOtpCode)}` : ""}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline"
                        >
                          Open Reset Page <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}