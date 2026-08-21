import { Router, Request, Response } from 'express';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

const router = Router();

// Validation helpers
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};

interface SignupRequest {
  email?: string;
  password?: string;
  name?: string;
}

interface LoginRequest {
  email?: string;
  password?: string;
}

// POST /api/v1/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  const { email, password, name } = req.body as SignupRequest;

  // Validate input
  if (!email || !password || !name) {
    return res.status(400).json({
      error: 'Missing required fields: email, password, name',
      status: 400,
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'Invalid email format',
      status: 400,
    });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long',
      status: 400,
    });
  }

  try {
    // Create user with Supabase auth using admin API for auto-confirmation (MVP)
    const { data, error } = await supabaseAuth.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for MVP
      user_metadata: { name },
    });

    if (error) {
      // Map Supabase errors to appropriate HTTP status codes
      if (error.message.includes('already registered') || error.message.includes('User already exists')) {
        return res.status(400).json({
          error: 'Email already registered',
          status: 400,
        });
      }
      return res.status(400).json({
        error: error.message,
        status: 400,
      });
    }

    // Return user info (don't leak tokens)
    if (data.user) {
      return res.status(201).json({
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    }

    return res.status(400).json({
      error: 'Failed to create user',
      status: 400,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequest;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing required fields: email, password',
      status: 400,
    });
  }

  try {
    // Authenticate user
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Invalid credentials should return 401, not 400
      if (error.message.includes('Invalid login credentials') || error.status === 400) {
        return res.status(401).json({
          error: 'Invalid email or password',
          status: 401,
        });
      }
      return res.status(401).json({
        error: 'Authentication failed',
        status: 401,
      });
    }

    if (!data.session) {
      return res.status(401).json({
        error: 'Failed to create session',
        status: 401,
      });
    }

    // Return session data
    return res.status(200).json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({
      error: 'Missing or invalid Authorization header',
      status: 400,
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Sign out the session using the access token
    // In Supabase v2 with service role, we can use admin.signOut
    const { error } = await supabaseAuth.auth.admin.signOut(token);

    if (error) {
      console.error('Logout error:', error);
      return res.status(400).json({
        error: 'Failed to sign out',
        status: 400,
      });
    }

    return res.status(200).json({
      message: 'Signed out successfully',
    });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      status: 500,
    });
  }
});

export default router;
