import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/contexts/AuthContext';
import { LoadingState } from '@/components/LoadingState';

interface RequireAuthProps {
  children: ReactNode;
  redirectTo: string;
}

export const RequireAuth = ({ children, redirectTo }: RequireAuthProps) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
