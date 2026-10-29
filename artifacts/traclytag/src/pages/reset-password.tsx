import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Lock, Eye, EyeOff, KeyRound, ShieldCheck, 
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Sparkles 
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPassword() {
  const [, setLocation] = useLocation();

  const [token, setToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    const codeFromUrl = params.get("code");
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
    if (codeFromUrl) {
      setOtpCode(codeFromUrl);
    }
  }, []);

  const hasMinLength = newPassword.length >= 6;
  const hasMixedChars = /[0-9]/.test(newPassword) && /[a-zA-Z]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token && !otpCode) {
      setErrorMessage("Please provide a valid reset token or 6-digit confirmation code.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters in length.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token || undefined,
          otpCode: otpCode || undefined,
          newPassword,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { error: text || "Network error occurred" }; }

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      setIsSuccess(true);
      toast.success("Password reset successfully! You can now log in.");
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred. Please try again.");
      toast.error(err.message || "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-blue-600 selection:text-white font-sans antialiased relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.15),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.08),transparent_40%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-6 py-6 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div 
          onClick={() => setLocation("/login")}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
            <span className="font-mono font-black text-xl tracking-tighter">tt</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors">
            Tracely <span className="text-blue-500">Tag</span>
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/login")}
          className="text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sign In
        </Button>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
            {/* Subtle Top Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500" />

            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success-screen"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="text-center py-6 space-y-6"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner shadow-emerald-500/20">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      Password Successfully Reset
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                      Your security credentials have been updated. You can now securely access the TracelyTag terminal.
                    </p>
                  </div>

                  <Button
                    onClick={() => setLocation("/login")}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium h-12 rounded-xl shadow-lg shadow-blue-600/25 transition-all text-sm tracking-wide"
                  >
                    Proceed to Sign In
                  </Button>
                </motion.div>
              ) : (
                <motion.form
                  key="reset-form"
                  onSubmit={handleSubmit}
                  className="space-y-6"
                >
                  {/* Title & Badge */}
                  <div className="space-y-2 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono uppercase tracking-wider mb-2">
                      <KeyRound className="w-3.5 h-3.5" />
                      Credential Recovery
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                      Set New Password
                    </h1>
                    <p className="text-xs text-slate-400">
                      Configure new authorization credentials for your account
                    </p>
                  </div>

                  {errorMessage && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <div className="leading-relaxed">{errorMessage}</div>
                    </motion.div>
                  )}

                  {/* Token / Code Input (if no token in URL) */}
                  {!token && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
                        <span>Verification Token or OTP Code</span>
                        <span className="text-slate-500 font-normal">Check your email</span>
                      </label>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="e.g. 6-digit code or reset token"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          className="bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 font-mono text-sm h-11 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      New Password
                    </label>
                    <div className="relative flex items-center bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 text-white font-mono text-sm h-11 flex-1 px-3.5"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-200 p-2.5 transition-colors focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      Confirm New Password
                    </label>
                    <div className="relative flex items-center bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-transparent border-0 shadow-none outline-none focus-visible:ring-0 text-white font-mono text-sm h-11 flex-1 px-3.5"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="text-slate-400 hover:text-slate-200 p-2.5 transition-colors focus:outline-none"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Password Guidelines / Validation */}
                  <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-1.5 text-[11px]">
                    <div className={`flex items-center gap-2 ${hasMinLength ? "text-emerald-400" : "text-slate-500"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <span>At least 6 characters</span>
                    </div>
                    <div className={`flex items-center gap-2 ${hasMixedChars ? "text-emerald-400" : "text-slate-500"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${hasMixedChars ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <span>Contains numbers and letters</span>
                    </div>
                    <div className={`flex items-center gap-2 ${passwordsMatch ? "text-emerald-400" : "text-slate-500"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <span>Passwords match</span>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isSubmitting || !hasMinLength || !passwordsMatch}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium h-12 rounded-xl shadow-lg shadow-blue-600/25 transition-all text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating Credentials...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Reset Password
                      </>
                    )}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-slate-500 border-t border-slate-900">
        <p>TracelyTag Industrial Security Panel • End-to-End Cryptographic Protection</p>
      </footer>
    </div>
  );
}
