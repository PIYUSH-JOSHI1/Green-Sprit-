/**
 * Green Sprint - Authentication Module
 * Handles user registration, login, logout, and session management
 */

const AuthService = {
    // Current user cache
    currentUser: null,
    currentProfile: null,

    // Initialize auth
    async init() {
        if (!window.GreenSprintDB) {
            console.error('Supabase client not initialized');
            return false;
        }

        // Check for existing session
        await this.checkSession();
        
        // Set up auth state listener
        const supabase = GreenSprintDB.supabase();
        if (supabase) {
            supabase.auth.onAuthStateChange((event, session) => {
                console.log('Auth state changed:', event);
                if (event === 'SIGNED_IN') {
                    this.handleSignIn(session);
                } else if (event === 'SIGNED_OUT') {
                    this.handleSignOut();
                }
            });
        }

        return true;
    },

    // Check existing session
    async checkSession() {
        try {
            // Ensure Supabase is initialized
            if (!GreenSprintDB.supabase()) {
                GreenSprintDB.init();
            }
            
            const supabase = GreenSprintDB.supabase();
            
            if (!supabase) {
                console.warn('Supabase not available for session check');
                return false;
            }
            
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                try {
                    await this.loadProfile();
                } catch (profileErr) {
                    console.warn('Profile load warning:', profileErr);
                }
                return session;
            }
            return false;
        } catch (error) {
            console.error('Session check failed:', error);
            return false;
        }
    },

    // Load user profile
    async loadProfile() {
        if (!this.currentUser) return null;
        
        try {
            // Ensure Supabase is initialized
            if (!GreenSprintDB.supabase()) {
                GreenSprintDB.init();
            }
            
            this.currentProfile = await GreenSprintDB.users.getProfile(this.currentUser.id);
            return this.currentProfile;
        } catch (error) {
            console.error('Failed to load profile:', error);
            return null;
        }
    },

    // Register new user
    async register(email, password, userData) {
        try {
            // Ensure Supabase is initialized
            if (!GreenSprintDB.supabase()) {
                GreenSprintDB.init();
            }
            
            const supabase = GreenSprintDB.supabase();
            
            // Sign up with Supabase Auth
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: userData.fullName,
                        username: userData.username
                    }
                }
            });

            if (error) throw error;

            // Create user profile in user_profiles table
            if (data.user) {
                try {
                    const { error: profileError } = await supabase
                        .from('user_profiles')
                        .insert([{
                            id: data.user.id,
                            email: email,
                            username: userData.username,
                            full_name: userData.fullName,
                            role: 'user',
                            trees_planted: 0,
                            total_points: 10,  // Initial points for joining
                            level: 1,
                            badges: [],
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }]);

                    if (profileError) {
                        console.warn('Profile creation warning:', profileError);
                        // Profile might be created by trigger, so don't fail
                    }
                } catch (profileErr) {
                    console.warn('Profile creation error (may be handled by trigger):', profileErr);
                }
            }

            return { success: true, user: data.user, message: 'Registration successful! Please check your email to verify.' };
        } catch (error) {
            console.error('Registration error:', error);
            
            // Handle specific error types
            let errorMessage = error.message;
            if (error.message.includes('rate limit')) {
                errorMessage = 'Too many signup attempts. Please wait 1 hour or disable email confirmation in Supabase Dashboard (Auth > Providers > Email).';
            } else if (error.message.includes('already registered')) {
                errorMessage = 'This email is already registered. Try logging in instead.';
            }
            
            return { success: false, error: errorMessage };
        }
    },

    // Login user
    async login(email, password) {
        try {
            // Ensure Supabase is initialized
            if (!GreenSprintDB.supabase()) {
                GreenSprintDB.init();
            }
            
            const supabase = GreenSprintDB.supabase();
            
            if (!supabase) {
                throw new Error('Database connection failed. Please refresh the page.');
            }
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;
            
            // Try to load/create profile
            try {
                await this.loadProfile();
                
                // Update last login in user_profiles
                await supabase
                    .from('user_profiles')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', data.user.id);
            } catch (profileError) {
                console.warn('Profile update warning:', profileError);
                // Continue even if profile update fails
            }

            return { success: true, user: data.user };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    },

    // Login with Google
    async loginWithGoogle() {
        try {
            // Ensure Supabase is initialized
            if (!GreenSprintDB.supabase()) {
                GreenSprintDB.init();
            }
            
            const supabase = GreenSprintDB.supabase();
            
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard.html'
                }
            });

            if (error) throw error;

            return { success: true, data };
        } catch (error) {
            console.error('Google login error:', error);
            return { success: false, error: error.message };
        }
    },

    // Logout
    async logout() {
        try {
            const supabase = GreenSprintDB.supabase();
            const { error } = await supabase.auth.signOut();
            
            if (error) throw error;

            this.currentUser = null;
            this.currentProfile = null;

            // Redirect to home
            window.location.href = 'index.html';

            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    },

    // Reset password
    async resetPassword(email) {
        try {
            const supabase = GreenSprintDB.supabase();
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });

            if (error) throw error;

            return { success: true, message: 'Password reset email sent!' };
        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message };
        }
    },

    // Update password
    async updatePassword(newPassword) {
        try {
            const supabase = GreenSprintDB.supabase();
            
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return { success: true, message: 'Password updated successfully!' };
        } catch (error) {
            console.error('Password update error:', error);
            return { success: false, error: error.message };
        }
    },

    // Handle sign in event
    async handleSignIn(session) {
        this.currentUser = session.user;
        await this.loadProfile();
        
        // Check if profile exists, if not create one
        if (!this.currentProfile) {
            try {
                await GreenSprintDB.users.createProfile(session.user.id, {
                    email: session.user.email,
                    username: session.user.email.split('@')[0],
                    full_name: session.user.user_metadata?.full_name || '',
                    role: 'user',
                    trees_planted: 0,
                    total_points: 10,
                    level: 1,
                    badges: []
                });
                await this.loadProfile();
            } catch (err) {
                console.warn('Profile creation on sign-in:', err);
            }
        }
    },

    // Handle sign out event
    handleSignOut() {
        this.currentUser = null;
        this.currentProfile = null;
    },

    // Award daily login points
    async awardDailyLoginPoints() {
        if (!this.currentUser) return;

        const lastLogin = localStorage.getItem(`lastLogin_${this.currentUser.id}`);
        const today = new Date().toDateString();

        if (lastLogin !== today) {
            try {
                await GreenSprintDB.users.addPoints(
                    this.currentUser.id,
                    CONFIG.POINTS.DAILY_LOGIN,
                    'Daily login bonus'
                );
                localStorage.setItem(`lastLogin_${this.currentUser.id}`, today);
                console.log('Daily login points awarded!');
            } catch (err) {
                console.warn('Daily login points error:', err);
            }
        }
    },

    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null;
    },

    // Get current user
    getUser() {
        return this.currentUser;
    },

    // Get current profile
    getProfile() {
        return this.currentProfile;
    },

    // Require authentication (redirect if not logged in)
    requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }
        return true;
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Supabase to initialize
    if (window.GreenSprintDB) {
        await AuthService.init();
    }
});

// Export
window.AuthService = AuthService;
