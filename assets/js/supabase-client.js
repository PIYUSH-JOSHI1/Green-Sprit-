/**
 * Green Sprint - Supabase Client
 * Database operations and real-time subscriptions
 */

// Initialize Supabase client
let supabaseClient = null;

// Initialize Supabase
function initSupabase() {
    if (supabaseClient) {
        return true;
    }
    
    const supabaseLib = window.supabase;
    
    if (supabaseLib && supabaseLib.createClient) {
        supabaseClient = supabaseLib.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_ANON_KEY
        );
        console.log('✅ Supabase initialized');
        return true;
    }
    console.error('❌ Supabase library not loaded');
    return false;
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

// ============================================
// USER OPERATIONS
// ============================================

const UserService = {
    async getCurrentUser() {
        if (!supabaseClient) initSupabase();
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error) throw error;
        return user;
    },

    async getProfile(userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async createProfile(userId, profileData) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .insert([{ id: userId, ...profileData }])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async updateProfile(userId, updates) {
        if (!supabaseClient) initSupabase();
        
        // Use update (not upsert) to only modify specified fields
        // This avoids NOT NULL constraint violations
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .maybeSingle();
        
        if (error) throw error;
        return data;
    },

    async getLeaderboard(limit = 10) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .order('total_points', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async uploadAvatar(userId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${userId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    },

    async addPoints(userId, points, reason) {
        if (!supabaseClient) initSupabase();
        // Get current profile
        const profile = await this.getProfile(userId);
        const currentPoints = profile?.total_points || 0;
        
        // Update points
        await this.updateProfile(userId, { total_points: currentPoints + points });
        
        // Log points history
        const { data, error } = await supabaseClient
            .from('points_history')
            .insert([{ user_id: userId, points, reason }])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async incrementTreeCount(userId) {
        if (!supabaseClient) initSupabase();
        const profile = await this.getProfile(userId);
        const currentTrees = profile?.trees_planted || 0;
        return await this.updateProfile(userId, { trees_planted: currentTrees + 1 });
    },

    async getPointsHistory(userId, limit = 50) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('points_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async search(query) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
            .limit(20);
        if (error) throw error;
        return data || [];
    }
};

// ============================================
// CAMPAIGN OPERATIONS
// ============================================

const CampaignService = {
    async create(campaignData) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaigns')
            .insert([campaignData])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getAll(filters = {}) {
        if (!supabaseClient) initSupabase();
        let query = supabaseClient
            .from('campaigns')
            .select('*, creator:user_profiles!creator_id(*)');

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getById(campaignId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaigns')
            .select('*, creator:user_profiles!creator_id(*)')
            .eq('id', campaignId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    // Get campaigns within a radius (km) from coordinates
    async getNearby(lat, lng, radiusKm = 200) {
        if (!supabaseClient) initSupabase();
        
        // Calculate bounding box for initial filter
        const latDiff = radiusKm / 111; // 1 degree ≈ 111 km
        const lngDiff = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
        
        const { data, error } = await supabaseClient
            .from('campaigns')
            .select('*, creator:user_profiles!creator_id(*)')
            .gte('latitude', lat - latDiff)
            .lte('latitude', lat + latDiff)
            .gte('longitude', lng - lngDiff)
            .lte('longitude', lng + lngDiff)
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Filter by actual distance using Haversine formula
        const filtered = (data || []).filter(c => {
            if (!c.latitude || !c.longitude) return false;
            const distance = this.calculateDistance(lat, lng, c.latitude, c.longitude);
            c.distance = distance;
            return distance <= radiusKm;
        });
        
        // Sort by distance
        return filtered.sort((a, b) => a.distance - b.distance);
    },
    
    // Haversine formula to calculate distance between two points
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    async join(campaignId, userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaign_participants')
            .insert([{ campaign_id: campaignId, user_id: userId }])
            .select()
            .maybeSingle();
        if (error && error.code !== '23505') throw error;
        return data;
    },

    async getParticipants(campaignId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaign_participants')
            .select('*, user:user_profiles(*)')
            .eq('campaign_id', campaignId);
        if (error) throw error;
        return data || [];
    },

    async update(campaignId, updates) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaigns')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', campaignId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async delete(campaignId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('campaigns')
            .delete()
            .eq('id', campaignId);
        if (error) throw error;
        return true;
    },

    async leave(campaignId, userId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('campaign_participants')
            .delete()
            .eq('campaign_id', campaignId)
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    },

    async getUserCampaigns(userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaign_participants')
            .select('*, campaign:campaigns(*)')
            .eq('user_id', userId);
        if (error) throw error;
        return data || [];
    },

    async uploadCover(campaignId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${campaignId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('campaign-covers')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('campaign-covers')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    },

    async getActive() {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('campaigns')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }
};

// ============================================
// TREE OPERATIONS
// ============================================

const TreeService = {
    async create(treeData) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .insert([treeData])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getById(treeId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .select('*, species:tree_species(*), planter:user_profiles(*)')
            .eq('id', treeId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getByQRCode(qrCodeId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .select('*, species:tree_species(*), planter:user_profiles(*), campaign:campaigns(*)')
            .eq('qr_code_id', qrCodeId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getByUser(userId, limit = 50) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .select('*, species:tree_species(*)')
            .eq('planter_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async getByCampaign(campaignId, limit = 50) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .select('*, species:tree_species(*), planter:user_profiles(*)')
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async update(treeId, updates) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', treeId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getAll(limit = 100) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('trees')
            .select('*, species:tree_species(*), planter:user_profiles(*)')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async uploadPhoto(treeId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${treeId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('tree-photos')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('tree-photos')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    },

    async addUpdate(treeId, updateData) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('tree_updates')
            .insert([{ tree_id: treeId, ...updateData }])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getUpdates(treeId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('tree_updates')
            .select('*')
            .eq('tree_id', treeId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async delete(treeId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('trees')
            .delete()
            .eq('id', treeId);
        if (error) throw error;
        return true;
    },

    async getCount() {
        if (!supabaseClient) initSupabase();
        const { count, error } = await supabaseClient
            .from('trees')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        return count || 0;
    }
};

// ============================================
// TREE SPECIES OPERATIONS
// ============================================

const SpeciesService = {
    async getAll() {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('tree_species')
            .select('*')
            .order('common_name');
        if (error) throw error;
        return data || [];
    },

    async getById(speciesId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('tree_species')
            .select('*')
            .eq('id', speciesId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async search(query) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('tree_species')
            .select('*')
            .or(`common_name.ilike.%${query}%,scientific_name.ilike.%${query}%`)
            .limit(20);
        if (error) throw error;
        return data || [];
    }
};

// ============================================
// QR CODE OPERATIONS
// ============================================

const QRCodeService = {
    generateId() {
        return `GS-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`.toUpperCase();
    },

    async getTreeByQRCode(qrCodeId) {
        return await TreeService.getByQRCode(qrCodeId);
    },

    // Validate QR code - checks if it exists and returns tree info
    async validate(qrCodeId) {
        if (!supabaseClient) initSupabase();
        // A QR code is valid if there's a tree with that QR code ID
        const tree = await TreeService.getByQRCode(qrCodeId);
        if (tree) {
            return {
                id: qrCodeId,
                tree_id: tree.id,
                status: 'active',
                is_valid: true
            };
        }
        return null;
    },

    // Record a scan event
    async recordScan(qrCodeId, userId, location) {
        if (!supabaseClient) initSupabase();
        // Log the scan - you can create a qr_scans table if needed
        console.log('QR Scan recorded:', { qrCodeId, userId, location });
        // For now, just update the tree's last_scanned field if it exists
        try {
            const tree = await TreeService.getByQRCode(qrCodeId);
            if (tree) {
                await supabaseClient
                    .from('trees')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', tree.id);
            }
        } catch (error) {
            console.error('Error recording scan:', error);
        }
    }
};

// ============================================
// ACHIEVEMENTS OPERATIONS
// ============================================

const AchievementService = {
    async getUserAchievements(userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('achievements')
            .select('*')
            .eq('user_id', userId);
        if (error) throw error;
        return data || [];
    },

    async award(userId, badgeId, badgeName, badgeIcon) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('achievements')
            .insert([{
                user_id: userId,
                badge_id: badgeId,
                badge_name: badgeName,
                badge_icon: badgeIcon
            }])
            .select()
            .maybeSingle();
        if (error && error.code !== '23505') throw error;
        return data;
    },

    async checkAndAward(userId, treesPlanted) {
        const badges = [];
        
        // Define badge thresholds
        const badgeThresholds = [
            { count: 1, id: 'first_tree', name: 'First Tree', icon: '🌱' },
            { count: 5, id: 'five_trees', name: 'Grove Starter', icon: '🌳' },
            { count: 10, id: 'ten_trees', name: 'Forest Friend', icon: '🌲' },
            { count: 25, id: 'twentyfive_trees', name: 'Tree Champion', icon: '🏆' },
            { count: 50, id: 'fifty_trees', name: 'Eco Warrior', icon: '🦸' },
            { count: 100, id: 'hundred_trees', name: 'Forest Guardian', icon: '👑' }
        ];

        for (const badge of badgeThresholds) {
            if (treesPlanted >= badge.count) {
                try {
                    const awarded = await this.award(userId, badge.id, badge.name, badge.icon);
                    if (awarded) badges.push(badge);
                } catch (e) {
                    // Already has badge, ignore
                }
            }
        }
        return badges;
    },

    async getAll() {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('achievements')
            .select('*')
            .order('earned_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }
};

// ============================================
// ANALYTICS OPERATIONS
// ============================================

const AnalyticsService = {
    async getGlobalStats() {
        if (!supabaseClient) initSupabase();
        
        const [treesResult, usersResult, campaignsResult] = await Promise.all([
            supabaseClient.from('trees').select('id', { count: 'exact', head: true }),
            supabaseClient.from('user_profiles').select('id', { count: 'exact', head: true }),
            supabaseClient.from('campaigns').select('id', { count: 'exact', head: true })
        ]);

        const totalTrees = treesResult.count || 0;
        
        return {
            totalTrees,
            totalUsers: usersResult.count || 0,
            totalCampaigns: campaignsResult.count || 0,
            totalCO2: totalTrees * 22,
            totalWater: totalTrees * 400,
            totalOxygen: totalTrees * 118
        };
    },

    async getUserStats(userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('trees_planted, total_points, badges')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        return data || { trees_planted: 0, total_points: 0, badges: [] };
    },

    async getTreesByMonth(userId, months = 12) {
        if (!supabaseClient) initSupabase();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        
        let query = supabaseClient
            .from('trees')
            .select('created_at')
            .gte('created_at', startDate.toISOString());
        
        if (userId) {
            query = query.eq('planter_id', userId);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Group by month
        const monthlyData = {};
        (data || []).forEach(tree => {
            const date = new Date(tree.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[key] = (monthlyData[key] || 0) + 1;
        });
        
        return monthlyData;
    },

    async getSpeciesDistribution(userId = null) {
        if (!supabaseClient) initSupabase();
        let query = supabaseClient
            .from('trees')
            .select('species:tree_species(common_name)');
        
        if (userId) {
            query = query.eq('planter_id', userId);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Count by species
        const distribution = {};
        (data || []).forEach(tree => {
            const name = tree.species?.common_name || 'Unknown';
            distribution[name] = (distribution[name] || 0) + 1;
        });
        
        return distribution;
    }
};

// ============================================
// COMMUNITY OPERATIONS
// ============================================

const CommunityService = {
    async createPost(postData) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('community_posts')
            .insert([postData])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getPosts(limit = 20) {
        if (!supabaseClient) initSupabase();
        try {
            const { data, error } = await supabaseClient
                .from('community_posts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) {
                console.error('Error fetching posts:', error);
                return [];
            }
            
            // Fetch author info for each post
            if (data && data.length > 0) {
                for (let post of data) {
                    if (post.user_id) {
                        try {
                            const { data: author } = await supabaseClient
                                .from('user_profiles')
                                .select('*')
                                .eq('id', post.user_id)
                                .maybeSingle();
                            post.author = author;
                        } catch (e) {
                            post.author = null;
                        }
                    }
                }
            }
            
            return data || [];
        } catch (e) {
            console.error('getPosts exception:', e);
            return [];
        }
    },

    async getPostById(postId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('community_posts')
            .select('*, author:user_profiles(*)')
            .eq('id', postId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async likePost(postId, userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('post_likes')
            .insert([{ post_id: postId, user_id: userId }])
            .select()
            .maybeSingle();
        if (error && error.code !== '23505') throw error;
        return data;
    },

    async unlikePost(postId, userId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    },

    async addComment(postId, userId, content) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('post_comments')
            .insert([{ post_id: postId, user_id: userId, content }])
            .select('*, author:user_profiles(*)')
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getComments(postId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('post_comments')
            .select('*, author:user_profiles(*)')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async deletePost(postId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('community_posts')
            .delete()
            .eq('id', postId);
        if (error) throw error;
        return true;
    }
};

// ============================================
// NOTIFICATIONS OPERATIONS
// ============================================

const NotificationService = {
    async create(userId, title, message, type = 'info') {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('notifications')
            .insert([{ user_id: userId, title, message, type }])
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getAll(userId, limit = 50) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async getUnread(userId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('read', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async markAsRead(notificationId) {
        if (!supabaseClient) initSupabase();
        const { data, error } = await supabaseClient
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async markAllAsRead(userId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false);
        if (error) throw error;
        return true;
    },

    async delete(notificationId) {
        if (!supabaseClient) initSupabase();
        const { error } = await supabaseClient
            .from('notifications')
            .delete()
            .eq('id', notificationId);
        if (error) throw error;
        return true;
    }
};

// ============================================
// STORAGE OPERATIONS
// ============================================

const StorageService = {
    async uploadTreePhoto(treeId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${treeId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('tree-photos')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('tree-photos')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    },

    async uploadAvatar(userId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${userId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    },

    async uploadCampaignImage(campaignId, file) {
        if (!supabaseClient) initSupabase();
        const fileName = `${campaignId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('campaign-covers')
            .upload(fileName, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supabaseClient.storage
            .from('campaign-covers')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    }
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

const RealtimeService = {
    subscribeToTrees(callback) {
        if (!supabaseClient) initSupabase();
        return supabaseClient
            .channel('trees-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, callback)
            .subscribe();
    },

    subscribeToCampaigns(callback) {
        if (!supabaseClient) initSupabase();
        return supabaseClient
            .channel('campaigns-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns' }, callback)
            .subscribe();
    },

    unsubscribe(channel) {
        if (supabaseClient && channel) {
            supabaseClient.removeChannel(channel);
        }
    }
};

// ============================================
// EXPORT SERVICES
// ============================================

window.GreenSprintDB = {
    init: initSupabase,
    supabase: () => supabaseClient,
    users: UserService,
    UserService: UserService,
    campaigns: CampaignService,
    CampaignService: CampaignService,
    trees: TreeService,
    TreeService: TreeService,
    species: SpeciesService,
    SpeciesService: SpeciesService,
    qrCodes: QRCodeService,
    QRCodeService: QRCodeService,
    achievements: AchievementService,
    AchievementService: AchievementService,
    analytics: AnalyticsService,
    AnalyticsService: AnalyticsService,
    realtime: RealtimeService,
    RealtimeService: RealtimeService,
    storage: StorageService,
    StorageService: StorageService,
    community: CommunityService,
    CommunityService: CommunityService,
    notifications: NotificationService,
    NotificationService: NotificationService
};

// Also export individually
window.UserService = UserService;
window.CampaignService = CampaignService;
window.TreeService = TreeService;
window.SpeciesService = SpeciesService;
window.StorageService = StorageService;
window.CommunityService = CommunityService;
window.NotificationService = NotificationService;
window.AnalyticsService = AnalyticsService;
window.AchievementService = AchievementService;
window.RealtimeService = RealtimeService;
window.QRCodeService = QRCodeService;

console.log('📦 GreenSprintDB module loaded');
