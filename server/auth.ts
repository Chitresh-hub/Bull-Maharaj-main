import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Demo account credentials
const DEMO_CREDENTIALS = {
  username: "demo_user",
  email: "demo@bullmaharaj.com",
  password: "demo123",
  fullName: "Demo Trader"
};

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'bull-maharaj-secret-key',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Ensure demo account exists on startup
  (async () => {
    try {
      const existingUser = await storage.getUserByEmail(DEMO_CREDENTIALS.email);
      if (!existingUser) {
        await storage.createUser({
          username: DEMO_CREDENTIALS.username,
          email: DEMO_CREDENTIALS.email,
          password: DEMO_CREDENTIALS.password, // Password stored directly for demo purposes
          fullName: DEMO_CREDENTIALS.fullName
        });
        console.log("Demo account created successfully");
      }
    } catch (error) {
      console.error("Error creating demo account:", error);
    }
  })();

  // Simplified authentication for demo purposes
  passport.use(
    new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (email, password, done) => {
      try {
        // Try to find the user by email
        const user = await storage.getUserByEmail(email);
        
        // For demo purposes, allow login with demo credentials
        if (email === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
          return done(null, user);
        }
        
        // Simple password check for demo
        if (!user || user.password !== password) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Registration endpoint (simplified for demo)
  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password, fullName } = req.body;
      
      // Check if user already exists
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }
      
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // For demo, we just store the password directly
      const user = await storage.createUser({
        username,
        email,
        password, // Store password directly for demo
        fullName: fullName || null,
      });

      // Remove the password before sending back the user
      const { password: _, ...userWithoutPassword } = user;

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | undefined, info: any) => {
      if (err) return next(err);
      if (!user) {
        // Always provide demo credentials info on failed login
        return res.status(401).json({ 
          message: "Invalid email or password. Try demo account: demo@bullmaharaj.com / demo123" 
        });
      }
      
      req.login(user, (err: Error | null) => {
        if (err) return next(err);
        
        // Remove the password before sending back the user
        const { password: _, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  // Demo login endpoint - special route for automatic demo login
  app.post("/api/demo-login", async (req, res, next) => {
    try {
      const user = await storage.getUserByEmail(DEMO_CREDENTIALS.email);
      
      if (!user) {
        return res.status(500).json({ message: "Demo account not found" });
      }
      
      req.login(user, (err: Error | null) => {
        if (err) return next(err);
        
        const { password: _, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err: Error | null) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    
    // Remove the password before sending back the user
    const { password: _, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });
}