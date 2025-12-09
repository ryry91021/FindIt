import React from 'react'

interface ProfileProps {
  userEmail?: string
  onLogout: () => void
}

// This component was previously a Profile page. It's now a blank Dashboard
// placeholder. You can rename the file or component later if desired.
export const Profile: React.FC<ProfileProps> = ({ userEmail, onLogout }) => {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>
      <p>Welcome back{userEmail ? `, ${userEmail}` : ''}.</p>
      <p>This is a blank dashboard — add widgets and links here.</p>
      <button onClick={onLogout}>Logout</button>
    </div>
  )
}
