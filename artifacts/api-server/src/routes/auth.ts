import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, or, and, sql } from "drizzle-orm";
import { db, usersTable, companiesTable, passkeysTable, deviceCodesTable, systemConfigsTable, passwordResetsTable } from "@workspace/db";
import { LoginBody, LoginResponse, RegisterBody } from "@workspace/api-zod";
import crypto from "crypto";
import { sendOtpEmail, sendPasswordResetEmail } from '../lib/mail.js';

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, email, password, phone, companyName, companyEmail, companyWebsiteUrl } = parsed.data;

  if (!phone || !phone.trim()) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  // Verify if username or email already exists
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        sql`lower(${usersTable.username}) = ${username.trim().toLowerCase()}`,
        sql`lower(${usersTable.email}) = ${email.trim().toLowerCase()}`
      )
    );

  if (existingUser) {
    if (existingUser.username.toLowerCase() === username.trim().toLowerCase()) {
      res.status(400).json({ error: "Username already exists" });
      return;
    }
    res.status(400).json({ error: "Email already exists" });
    return;
  }

  try {
    // Create the company
    const [company] = await db
      .insert(companiesTable)
      .values({
        name: companyName,
        email: companyEmail,
        address: companyWebsiteUrl,
        gstin: null,
      })
      .returning();

    if (!company) {
      throw new Error("Failed to create company");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create administrator user linked to company
    const [user] = await db
      .insert(usersTable)
      .values({
        username,
        email,
        phone: phone ?? null,
        passwordHash,
        role: "client_admin",
        companyId: company.id,
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create user");
    }

    const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    res.cookie("connect.sid", user.id.toString(), {
      signed: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: isProduction,
      sameSite: "lax",
    });

    res.status(201).json(
      LoginResponse.parse({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: company.name,
        companyUrl: company.companyUrl ?? null,
        isActive: user.isActive,
        enabledModules: user.enabledModules,
        subscriptionPlan: company.subscriptionPlan,
        subscriptionStatus: company.subscriptionStatus,
        subscriptionExpiresAt: company.subscriptionExpiresAt,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Registration failed");
    res.status(400).json({ error: "Registration failed. Please try again." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const loginIdentifier = ((parsed.data as any).username || (req.body as any)?.email || "").trim();
  const cleanIdentifier = loginIdentifier.toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.username, loginIdentifier),
        sql`lower(${usersTable.username}) = ${cleanIdentifier}`,
        sql`lower(${usersTable.email}) = ${cleanIdentifier}`
      )
    );

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  let companyName: string | null = null;
  let companyUrl: string | null = null;
  let subscriptionPlan: string | null = null;
  let subscriptionStatus: string | null = null;
  let subscriptionExpiresAt: string | null = null;
  if (user.companyId) {
    const [c] = await db
      .select({ 
        name: companiesTable.name,
        companyUrl: companiesTable.companyUrl,
        subscriptionPlan: companiesTable.subscriptionPlan,
        subscriptionStatus: companiesTable.subscriptionStatus,
        subscriptionExpiresAt: companiesTable.subscriptionExpiresAt,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId));
    companyName = c?.name ?? null;
    companyUrl = c?.companyUrl ?? null;
    subscriptionPlan = c?.subscriptionPlan ?? null;
    subscriptionStatus = c?.subscriptionStatus ?? null;
    subscriptionExpiresAt = c?.subscriptionExpiresAt ?? null;
  }

  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

  let enableOtpSystem = true;
  try {
    const rows = await db.select().from(systemConfigsTable);
    const otpRow = rows.find(r => r.key === "enableOtpSystem");
    if (otpRow) {
      enableOtpSystem = otpRow.value !== "false";
    }
  } catch (err) {
    // ignore
  }

  if (enableOtpSystem && user.role !== "master" && user.role !== "super_master") {
    // Generate random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await sendOtpEmail(user.email, otpCode);
    } catch (err) {
      req.log.error({ err, email: user.email }, "Failed to send OTP email");
    }

    const otpPayload = JSON.stringify({ userId: user.id, otp: otpCode });
    res.cookie("temp_otp", otpPayload, {
      signed: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 5, // 5 minutes
      secure: isProduction,
      sameSite: "lax",
    });

    res.json({
      otpRequired: true,
      userId: user.id,
      email: user.email,
      otpCode, // Fallback for developer/offline testing
    });
    return;
  }

  res.cookie("connect.sid", user.id.toString(), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    secure: isProduction,
    sameSite: "lax",
  });

  res.json(
    LoginResponse.parse({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName,
      companyUrl,
      isActive: user.isActive,
      enabledModules: user.enabledModules,
      subscriptionPlan,
      subscriptionStatus,
      subscriptionExpiresAt,
    }),
  );
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { otp } = req.body;
  const tempOtpPayload = req.signedCookies?.["temp_otp"];

  if (!tempOtpPayload) {
    res.status(400).json({ error: "Session expired or OTP request invalid. Please log in again." });
    return;
  }

  let payload: { userId: number; otp: string };
  try {
    payload = JSON.parse(tempOtpPayload);
  } catch (e) {
    res.status(400).json({ error: "Invalid session payload. Please log in again." });
    return;
  }

  if (payload.otp !== otp) {
    res.status(400).json({ error: "Incorrect OTP code. Please try again." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  let companyName: string | null = null;
  let companyUrl: string | null = null;
  let subscriptionPlan: string | null = null;
  let subscriptionStatus: string | null = null;
  let subscriptionExpiresAt: string | null = null;
  if (user.companyId) {
    const [c] = await db
      .select({ 
        name: companiesTable.name,
        companyUrl: companiesTable.companyUrl,
        subscriptionPlan: companiesTable.subscriptionPlan,
        subscriptionStatus: companiesTable.subscriptionStatus,
        subscriptionExpiresAt: companiesTable.subscriptionExpiresAt,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId));
    companyName = c?.name ?? null;
    companyUrl = c?.companyUrl ?? null;
    subscriptionPlan = c?.subscriptionPlan ?? null;
    subscriptionStatus = c?.subscriptionStatus ?? null;
    subscriptionExpiresAt = c?.subscriptionExpiresAt ?? null;
  }

  // Clear OTP cookie
  res.clearCookie("temp_otp");

  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.cookie("connect.sid", user.id.toString(), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    secure: isProduction,
    sameSite: "lax",
  });

  res.json(
    LoginResponse.parse({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName,
      companyUrl,
      isActive: user.isActive,
      enabledModules: user.enabledModules,
      subscriptionPlan,
      subscriptionStatus,
      subscriptionExpiresAt,
    }),
  );
});

router.post("/auth/logout", (req, res): void => {
  res.clearCookie("connect.sid");
  res.clearCookie("impersonator_id");
  res.sendStatus(204);
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let isImpersonating = false;
  let impersonatorUsername: string | undefined = undefined;
  const impersonatorIdRaw = req.signedCookies?.["impersonator_id"];
  if (impersonatorIdRaw) {
    const impId = parseInt(impersonatorIdRaw, 10);
    if (!isNaN(impId)) {
      const [impUser] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, impId));
      if (impUser) {
        isImpersonating = true;
        impersonatorUsername = impUser.username;
      }
    }
  }

  let companyName: string | null = null;
  let companyUrl: string | null = null;
  let companyGstin: string | null = null;
  let subscriptionPlan: string | null = null;
  let subscriptionStatus: string | null = null;
  let subscriptionExpiresAt: string | null = null;
  if (req.user.companyId) {
    const [c] = await db
      .select({ 
        name: companiesTable.name,
        companyUrl: companiesTable.companyUrl,
        gstin: companiesTable.gstin,
        subscriptionPlan: companiesTable.subscriptionPlan,
        subscriptionStatus: companiesTable.subscriptionStatus,
        subscriptionExpiresAt: companiesTable.subscriptionExpiresAt,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, req.user.companyId));
    companyName = c?.name ?? null;
    companyUrl = c?.companyUrl ?? null;
    companyGstin = c?.gstin ?? null;
    subscriptionPlan = c?.subscriptionPlan ?? null;
    subscriptionStatus = c?.subscriptionStatus ?? null;
    subscriptionExpiresAt = c?.subscriptionExpiresAt ?? null;
  }
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    companyId: req.user.companyId,
    companyName,
    companyUrl,
    companyGstin,
    company: {
      name: companyName,
      gstin: companyGstin,
    },
    isActive: req.user.isActive,
    enabledModules: req.user.enabledModules,
    subscriptionPlan,
    subscriptionStatus,
    subscriptionExpiresAt,
    isImpersonating,
    impersonatorUsername,
  });
});

router.post("/auth/impersonate/:userId", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const existingImpersonatorId = req.signedCookies?.["impersonator_id"];
  let realSuperMasterId: number | null = null;

  if (req.user.role === "super_master") {
    realSuperMasterId = req.user.id;
  } else if (existingImpersonatorId) {
    const impId = parseInt(existingImpersonatorId, 10);
    const [impUser] = await db.select().from(usersTable).where(eq(usersTable.id, impId));
    if (impUser && impUser.role === "super_master") {
      realSuperMasterId = impUser.id;
    }
  }

  if (!realSuperMasterId) {
    res.status(403).json({ error: "Only super_master can impersonate other users" });
    return;
  }

  const targetUserId = parseInt(req.params["userId"] || "", 10);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
  }

  if (!targetUser.isActive) {
    res.status(400).json({ error: "Cannot impersonate an inactive user" });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

  res.cookie("impersonator_id", realSuperMasterId.toString(), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    secure: isProduction,
    sameSite: "lax",
  });

  res.cookie("connect.sid", targetUser.id.toString(), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: isProduction,
    sameSite: "lax",
  });

  let companyName: string | null = null;
  let companyUrl: string | null = null;
  if (targetUser.companyId) {
    const [c] = await db
      .select({ name: companiesTable.name, companyUrl: companiesTable.companyUrl })
      .from(companiesTable)
      .where(eq(companiesTable.id, targetUser.companyId));
    companyName = c?.name ?? null;
    companyUrl = c?.companyUrl ?? null;
  }

  const [impUser] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, realSuperMasterId));

  res.json({
    id: targetUser.id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    companyId: targetUser.companyId,
    companyName,
    companyUrl,
    isActive: targetUser.isActive,
    enabledModules: targetUser.enabledModules,
    isImpersonating: true,
    impersonatorUsername: impUser?.username ?? "supermaster",
  });
});

router.post("/auth/stop-impersonation", async (req, res): Promise<void> => {
  const impersonatorIdRaw = req.signedCookies?.["impersonator_id"];
  if (!impersonatorIdRaw) {
    res.status(400).json({ error: "Not currently impersonating" });
    return;
  }

  const realSuperMasterId = parseInt(impersonatorIdRaw, 10);
  if (isNaN(realSuperMasterId)) {
    res.clearCookie("impersonator_id");
    res.status(400).json({ error: "Invalid impersonator cookie" });
    return;
  }

  const [superMasterUser] = await db.select().from(usersTable).where(eq(usersTable.id, realSuperMasterId));
  if (!superMasterUser) {
    res.clearCookie("impersonator_id");
    res.status(404).json({ error: "Super master user not found" });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

  res.clearCookie("impersonator_id");

  res.cookie("connect.sid", superMasterUser.id.toString(), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: isProduction,
    sameSite: "lax",
  });

  let companyName: string | null = null;
  let companyUrl: string | null = null;
  if (superMasterUser.companyId) {
    const [c] = await db
      .select({ name: companiesTable.name, companyUrl: companiesTable.companyUrl })
      .from(companiesTable)
      .where(eq(companiesTable.id, superMasterUser.companyId));
    companyName = c?.name ?? null;
    companyUrl = c?.companyUrl ?? null;
  }

  res.json({
    id: superMasterUser.id,
    username: superMasterUser.username,
    email: superMasterUser.email,
    role: superMasterUser.role,
    companyId: superMasterUser.companyId,
    companyName,
    companyUrl,
    isActive: superMasterUser.isActive,
    enabledModules: superMasterUser.enabledModules,
    isImpersonating: false,
  });
});



// --- Passkey WebAuthn Endpoints ---
router.post("/auth/passkey/register-options", async (req, res): Promise<void> => {
  const { username } = req.body;
  const challenge = crypto.randomBytes(32).toString("base64url");
  
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.cookie("passkey_challenge", challenge, {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 5,
    secure: isProduction,
    sameSite: "lax",
  });

  res.json({
    challenge,
    rp: { name: "TraclyTag", id: req.hostname === "localhost" ? "localhost" : req.hostname },
    user: {
      id: crypto.randomBytes(16).toString("base64url"),
      name: username || "anonymous",
      displayName: username || "Anonymous User",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60000,
    attestation: "none",
  });
});

router.post("/auth/passkey/register-verify", async (req, res): Promise<void> => {
  const { registrationResponse, userData, isSimulated } = req.body;
  const savedChallenge = req.signedCookies?.["passkey_challenge"];

  if (!savedChallenge) {
    res.status(400).json({ error: "Session expired or challenge missing" });
    return;
  }

  res.clearCookie("passkey_challenge");

  try {
    const { id: credentialId, response } = registrationResponse;

    if (!isSimulated && response?.clientDataJSON) {
      try {
        const clientData = JSON.parse(Buffer.from(response.clientDataJSON, "base64url").toString("utf-8"));
        if (clientData.challenge !== savedChallenge) {
          res.status(400).json({ error: "Challenge verification failed" });
          return;
        }
      } catch (e) {
        req.log.warn({ e }, "Failed to parse clientDataJSON during passkey verify");
      }
    }

    const { username, email, companyName, companyEmail, companyWebsiteUrl } = userData;

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username));

    if (!user) {
      const [company] = await db
        .insert(companiesTable)
        .values({
          name: companyName,
          email: companyEmail,
          address: companyWebsiteUrl,
          gstin: null,
        })
        .returning();

      if (!company) throw new Error("Failed to create company");

      const randomPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const [newUser] = await db
        .insert(usersTable)
        .values({
          username,
          email,
          phone: null,
          passwordHash,
          role: "client_admin",
          companyId: company.id,
        })
        .returning();

      if (!newUser) throw new Error("Failed to create user");
      user = newUser;
    }

    const publicKey = isSimulated ? "MOCK_SIMULATED_PUBLIC_KEY" : (response?.attestationObject || "STANDARD_WEBAUTHN_KEY");
    await db
      .insert(passkeysTable)
      .values({
        userId: user.id,
        credentialId,
        publicKey,
        counter: 0,
      });

    let companyNameVal: string | null = null;
    if (user.companyId) {
      const [c] = await db
        .select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, user.companyId));
      companyNameVal = c?.name ?? null;
    }

    const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    res.cookie("connect.sid", user.id.toString(), {
      signed: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: isProduction,
      sameSite: "lax",
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName: companyNameVal,
    });
  } catch (err: any) {
    req.log.error({ err }, "Passkey registration verify failed");
    res.status(500).json({ error: err.message || "Passkey registration failed" });
  }
});

router.post("/auth/passkey/login-options", async (req, res): Promise<void> => {
  const { username } = req.body;
  if (!username || typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "Username or email is required for passkey login" });
    return;
  }

  const rawUsername = username.trim();
  const cleanUsername = rawUsername.toLowerCase();

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, rawUsername),
          sql`lower(${usersTable.username}) = ${cleanUsername}`,
          sql`lower(${usersTable.email}) = ${cleanUsername}`
        )
      );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userPasskeys = await db
      .select()
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, user.id));

    if (userPasskeys.length === 0) {
      res.status(400).json({ error: "No passkeys registered for this user" });
      return;
    }

    const challenge = crypto.randomBytes(32).toString("base64url");
    const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    res.cookie("passkey_challenge", challenge, {
      signed: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 5,
      secure: isProduction,
      sameSite: "lax",
    });

    res.json({
      challenge,
      rpId: req.hostname === "localhost" ? "localhost" : req.hostname,
      allowCredentials: userPasskeys.map(pk => ({
        id: pk.credentialId,
        type: "public-key",
      })),
      timeout: 60000,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate login options" });
  }
});

router.post("/auth/passkey/login-verify", async (req, res): Promise<void> => {
  const { loginResponse, username, isSimulated } = req.body;
  const savedChallenge = req.signedCookies?.["passkey_challenge"];

  if (!savedChallenge) {
    res.status(400).json({ error: "Session expired or challenge missing" });
    return;
  }

  res.clearCookie("passkey_challenge");

  try {
    const { id: credentialId, response } = loginResponse;

    const [passkey] = await db
      .select()
      .from(passkeysTable)
      .where(eq(passkeysTable.credentialId, credentialId));

    if (!passkey) {
      res.status(401).json({ error: "Passkey credential not registered" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, passkey.userId));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!isSimulated && response?.clientDataJSON) {
      try {
        const clientData = JSON.parse(Buffer.from(response.clientDataJSON, "base64url").toString("utf-8"));
        if (clientData.challenge !== savedChallenge) {
          res.status(400).json({ error: "Challenge verification failed" });
          return;
        }
      } catch (e) {
        req.log.warn({ e }, "Failed to parse clientDataJSON during login verify");
      }
    }

    const currentCounter = passkey.counter;
    await db
      .update(passkeysTable)
      .set({ counter: currentCounter + 1 })
      .where(eq(passkeysTable.id, passkey.id));

    let companyNameVal: string | null = null;
    if (user.companyId) {
      const [c] = await db
        .select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, user.companyId));
      companyNameVal = c?.name ?? null;
    }

    const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    res.cookie("connect.sid", user.id.toString(), {
      signed: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: isProduction,
      sameSite: "lax",
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName: companyNameVal,
    });
  } catch (err: any) {
    req.log.error({ err }, "Passkey login verification failed");
    res.status(500).json({ error: err.message || "Passkey login failed" });
  }
});

// --- Device Authorization Flow Endpoints ---
router.post("/auth/device/code", async (req, res): Promise<void> => {
  try {
    const deviceCode = crypto.randomBytes(24).toString("hex");
    
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let userCode = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) userCode += "-";
      userCode += chars.charAt(crypto.randomInt(chars.length));
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db
      .insert(deviceCodesTable)
      .values({
        deviceCode,
        userCode,
        status: "pending",
        expiresAt,
      });

    const host = req.get("host") || "localhost:5173";
    const protocol = req.protocol || "http";
    const verificationUri = `${protocol}://${host.split(":")[0]}:${host.split(":")[1] || "5173"}/activate`;

    res.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      expires_in: 300,
      interval: 3,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to initialize device authorization flow" });
  }
});

router.post("/auth/device/token", async (req, res): Promise<void> => {
  const { device_code } = req.body;
  if (!device_code) {
    res.status(400).json({ error: "device_code is required" });
    return;
  }

  try {
    const [record] = await db
      .select()
      .from(deviceCodesTable)
      .where(eq(deviceCodesTable.deviceCode, device_code));

    if (!record) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "expired_token" });
      return;
    }

    if (record.status === "pending") {
      res.status(400).json({ error: "authorization_pending" });
      return;
    }

    if (record.status === "denied") {
      res.status(400).json({ error: "access_denied" });
      return;
    }

    if (record.status === "approved" && record.userId) {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, record.userId));

      if (!user) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      let companyNameVal: string | null = null;
      if (user.companyId) {
        const [c] = await db
          .select({ name: companiesTable.name })
          .from(companiesTable)
          .where(eq(companiesTable.id, user.companyId));
        companyNameVal = c?.name ?? null;
      }

      const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
      res.cookie("connect.sid", user.id.toString(), {
        signed: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: isProduction,
        sameSite: "lax",
      });

      res.json({
        status: "success",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          companyName: companyNameVal,
        },
      });
      return;
    }

    res.status(400).json({ error: "invalid_grant" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process token polling request" });
  }
});

router.get("/auth/device/verify-code", async (req, res): Promise<void> => {
  const userCode = req.query.user_code as string;
  if (!userCode) {
    res.status(400).json({ error: "user_code is required" });
    return;
  }

  try {
    const [record] = await db
      .select()
      .from(deviceCodesTable)
      .where(eq(deviceCodesTable.userCode, userCode));

    if (!record) {
      res.status(404).json({ error: "Code not found" });
      return;
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "Code has expired" });
      return;
    }

    res.json({
      status: record.status,
      expiresAt: record.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify code" });
  }
});

router.post("/auth/send-test-email", async (req, res): Promise<void> => {
  const { password, recipient } = req.body;
  if (!password || !recipient) {
    res.status(400).json({ error: "Password and recipient are required" });
    return;
  }

  try {
    // 1. Fetch the supermaster user from the database
    const supermasterUsername = process.env.SUPERMASTER_USERNAME || "supermaster";
    const [supermaster] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, supermasterUsername));

    if (!supermaster || supermaster.role !== "super_master") {
      res.status(403).json({ error: "Super Master account not found" });
      return;
    }

    // 2. Validate password
    const isPasswordCorrect = await bcrypt.compare(password, supermaster.passwordHash);
    if (!isPasswordCorrect) {
      res.status(401).json({ error: "Invalid Super Master credentials" });
      return;
    }

    // 3. Try to send email using nodemailer configuration directly
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      res.status(400).json({ 
        error: "SMTP configuration missing in environment variables. Please check SMTP_USER and SMTP_PASS." 
      });
      return;
    }

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 8000
    });

    const mailOptions = {
      from: `"TracelyTag SMTP Test" <${user}>`,
      to: recipient,
      subject: "TracelyTag SMTP Mail Test - Success",
      text: `Hello,\n\nThis is a test email sent from the TracelyTag Industrial Security Panel.\nIf you received this message, your SMTP settings are configured correctly!\n\nDetails:\nHost: ${host}\nPort: ${port}\nSecure: ${secure}\nSMTP User: ${user}\n\nAutomated System Test.`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px; margin: 0 auto; color: #1e293b; background: #ffffff;">
          <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-top: 0;">SMTP Connection Verified!</h2>
          <p>Hello,</p>
          <p>This is a test email sent from your TracelyTag platform to verify email delivery. The connection is working correctly!</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 13px;">
            <strong>SMTP Configuration Details:</strong><br/>
            • <strong>Host:</strong> ${host}<br/>
            • <strong>Port:</strong> ${port}<br/>
            • <strong>Secure:</strong> ${secure ? 'Yes (SSL/TLS)' : 'No (STARTTLS)'}<br/>
            • <strong>SMTP User:</strong> ${user}
          </div>
          <p style="font-size: 11px; color: #64748b;">This email was triggered manually by the Super Master account. No action is required.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: `Test email successfully sent to ${recipient}` });
  } catch (err: any) {
    req.log.error({ err }, "SMTP Test send failed");
    res.status(500).json({ 
      error: `SMTP Error: ${err.message || "Unknown error occurred while connecting or sending."}` 
    });
  }
});

router.post("/auth/device/authorize", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { user_code, approve } = req.body;
  if (!user_code) {
    res.status(400).json({ error: "user_code is required" });
    return;
  }

  try {
    const [record] = await db
      .select()
      .from(deviceCodesTable)
      .where(eq(deviceCodesTable.userCode, user_code));

    if (!record) {
      res.status(404).json({ error: "Code not found" });
      return;
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "Code has expired" });
      return;
    }

    const finalStatus = approve ? "approved" : "denied";

    await db
      .update(deviceCodesTable)
      .set({
        status: finalStatus,
        userId: req.user.id,
      })
      .where(eq(deviceCodesTable.id, record.id));

    res.json({ success: true, status: finalStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to authorize device" });
  }
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { identifier } = req.body;
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    res.status(400).json({ error: "Email or username is required." });
    return;
  }

  const cleanIdentifier = identifier.trim().toLowerCase();

  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(or(
        eq(usersTable.username, cleanIdentifier),
        eq(usersTable.email, cleanIdentifier)
      ));

    const user = users[0];

    if (!user || !user.email) {
      res.json({
        success: true,
        message: "If an account matches this identifier, password reset instructions have been sent to the registered email.",
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "This account has been deactivated. Please contact your system administrator." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.insert(passwordResetsTable).values({
      userId: user.id,
      token,
      otpCode,
      expiresAt,
      used: false,
    });

    const origin = req.get("origin") || req.get("referer");
    let baseUrl = origin ? origin.replace(/\/$/, "") : (process.env.FRONTEND_URL || "http://localhost:5173");
    try {
      const parsedUrl = new URL(baseUrl);
      baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    } catch {
      baseUrl = "http://localhost:5173";
    }

    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, resetUrl, otpCode);

    const [localPart, domainPart] = user.email.split("@");
    const maskedEmail = localPart.length > 2
      ? `${localPart[0]}***${localPart[localPart.length - 1]}@${domainPart || ""}`
      : `${localPart[0]}*@${domainPart || ""}`;

    res.json({
      success: true,
      email: maskedEmail,
      message: `Password reset instructions sent to ${maskedEmail}`,
    });
  } catch (err: any) {
    req.log.error({ err }, "Forgot password error");
    res.status(500).json({ error: "Failed to initiate password reset. Please try again later." });
  }
});

router.post("/auth/verify-reset-token", async (req, res): Promise<void> => {
  const { token, otpCode } = req.body;

  if (!token && !otpCode) {
    res.status(400).json({ valid: false, error: "Token or verification code is required." });
    return;
  }

  try {
    const conditions = [];
    if (token && typeof token === "string" && token.trim()) {
      conditions.push(eq(passwordResetsTable.token, token.trim()));
    }
    if (otpCode && typeof otpCode === "string" && otpCode.trim()) {
      conditions.push(eq(passwordResetsTable.otpCode, otpCode.trim()));
    }

    const records = await db
      .select()
      .from(passwordResetsTable)
      .where(or(...conditions));

    const record = records.find((r) => !r.used);

    if (!record) {
      res.status(400).json({ valid: false, error: "Invalid or previously used reset request." });
      return;
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ valid: false, error: "This password reset request has expired. Please request a new one." });
      return;
    }

    res.json({ valid: true });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message || "Failed to verify token." });
  }
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, otpCode, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters long." });
    return;
  }

  if (!token && !otpCode) {
    res.status(400).json({ error: "Reset token or verification code is required." });
    return;
  }

  try {
    const conditions = [];
    if (token && typeof token === "string" && token.trim()) {
      conditions.push(eq(passwordResetsTable.token, token.trim()));
    }
    if (otpCode && typeof otpCode === "string" && otpCode.trim()) {
      conditions.push(eq(passwordResetsTable.otpCode, otpCode.trim()));
    }

    const records = await db
      .select()
      .from(passwordResetsTable)
      .where(or(...conditions));

    const record = records.find((r) => !r.used);

    if (!record) {
      res.status(400).json({ error: "Invalid or previously used password reset link/code." });
      return;
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "This password reset link has expired. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, record.userId));

    await db
      .update(passwordResetsTable)
      .set({ used: true })
      .where(eq(passwordResetsTable.id, record.id));

    res.json({
      success: true,
      message: "Password has been successfully reset. You may now sign in with your new credentials.",
    });
  } catch (err: any) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "Failed to reset password. Please try again." });
  }
});

export default router;
