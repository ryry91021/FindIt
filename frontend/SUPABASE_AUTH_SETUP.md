# Supabase Authentication Setup Guide

This project includes a complete login and signup system using Supabase for email authentication.

## Features

✅ User signup with email and password
✅ User login with email and password
✅ User logout
✅ Session persistence
✅ Password confirmation validation
✅ Error handling and user feedback
✅ Beautiful UI with gradient styling

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up or log in
4. Create a new project:
   - Organization name
   - Project name: `findIt` (or your preference)
   - Database password
   - Region (choose closest to you)
5. Wait for the project to be created

### 2. Get Your Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** (under "Project URL")
   - **Anon public** key (under "Project API keys")

### 3. Configure Environment Variables

1. Open `.env.local` in your project root
2. Replace the placeholder values:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Enable Email Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Make sure **Email** is enabled (it should be by default)
3. Optional: Configure email templates under **Authentication** → **Email Templates**

### 5. Run the Application

```bash
npm run dev
```

The app will start at `http://localhost:5173`

## How It Works

### Component Structure

- **Login.tsx** - Login page with email/password form
- **Signup.tsx** - Signup page with email/password confirmation
- **Dashboard.tsx** - Welcome page shown after successful login
- **Auth.css** - Styling for all auth components
- **authService.ts** - Service layer for Supabase auth operations
- **supabaseClient.ts** - Supabase client initialization

### User Flow

1. User lands on Login page
2. User can:
   - Sign in if they have an account
   - Click "Sign Up" to create a new account
3. On Signup:
   - Enter email and password
   - Confirm password
   - Click "Sign Up"
   - User sees success message and email confirmation prompt
   - Can click "Sign In" to go back to login
4. After successful login:
   - User sees Dashboard with their email
   - Can click "Sign Out" to logout

## File Structure

```
src/
├── components/
│   ├── Login.tsx
│   ├── Signup.tsx
│   ├── Dashboard.tsx
│   ├── Auth.css
│   └── Dashboard.css
├── services/
│   ├── supabaseClient.ts
│   └── authService.ts
├── App.tsx
├── App.css
├── main.tsx
└── index.css
.env.local (contains Supabase credentials)
```

## Available API Methods

The `authService` object provides these methods:

```typescript
// Sign up new user
await authService.signUp(email, password)

// Sign in user
await authService.signIn(email, password)

// Sign out current user
await authService.signOut()

// Get current authenticated user
await authService.getCurrentUser()

// Send password reset email
await authService.resetPassword(email)
```

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env.local` file exists in the project root
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- Restart the development server after updating `.env.local`

### "Invalid email or password"
- Check that the email/password are correct
- Verify email exists in Supabase Authentication
- Check if account was confirmed (Supabase sends confirmation email)

### CORS errors
- Go to Supabase Settings → Authentication
- Add your frontend URL to "Redirect URLs"
- Default for dev: `http://localhost:5173/`

### Email not received
- Check spam/junk folder
- Verify email in Supabase settings
- Check "Email Templates" in Authentication settings

## Next Steps

1. Customize the UI (colors, fonts, layout)
2. Add password reset functionality
3. Add OAuth providers (Google, GitHub, etc.)
4. Add user profile page
5. Add database tables for additional user data
6. Implement session management improvements

## Security Notes

- Never commit `.env.local` to version control (it's already in .gitignore typically)
- The Anon key is safe to use in frontend code (it's designed for that)
- Always validate passwords on the backend for sensitive operations
- Consider adding rate limiting for login attempts
- Use HTTPS in production
