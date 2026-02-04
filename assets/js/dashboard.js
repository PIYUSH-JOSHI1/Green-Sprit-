/**
 * Green Sprint - Dashboard Module
 * Main dashboard functionality and data visualization
 */

const DashboardModule = {
    charts: {},
    stats: {},

    // Initialize dashboard
    async init() {
        if (!AuthService.isLoggedIn()) {
            window.location.href = 'login.html';
            return;
        }

        await this.loadUserStats();
        await this.loadGlobalStats();
        await this.loadRecentActivity();
        await this.loadUserCampaigns();
        await this.loadUserTrees();
        this.initCharts();
        this.initRealtime();
    },

    // Load user statistics
    async loadUserStats() {
        try {
            const profile = AuthService.getProfile();
            
            // Update UI
            document.getElementById('user-name').textContent = profile?.full_name || 'User';
            document.getElementById('user-avatar').src = profile?.avatar_url || 'assets/images/default-avatar.png';
            document.getElementById('trees-planted').textContent = profile?.total_trees_planted || 0;
            document.getElementById('total-points').textContent = this.formatNumber(profile?.total_points || 0);
            
            // Calculate environmental impact
            const impact = this.calculateImpact(profile?.total_trees_planted || 0);
            document.getElementById('co2-saved').textContent = this.formatNumber(impact.co2) + ' kg';
            document.getElementById('water-saved').textContent = this.formatNumber(impact.water) + ' L';
            document.getElementById('oxygen-produced').textContent = this.formatNumber(impact.oxygen) + ' kg';

            // Load and display badges
            await this.loadUserBadges();

        } catch (error) {
            console.error('Failed to load user stats:', error);
        }
    },

    // Load global statistics
    async loadGlobalStats() {
        try {
            const stats = await GreenSprintDB.analytics.getGlobalStats();
            
            document.getElementById('global-trees').textContent = this.formatNumber(stats.totalTrees);
            document.getElementById('global-users').textContent = this.formatNumber(stats.totalUsers);
            document.getElementById('global-co2').textContent = this.formatNumber(stats.totalCO2) + ' kg';
            document.getElementById('active-campaigns').textContent = stats.activeCampaigns;

            this.stats.global = stats;
        } catch (error) {
            console.error('Failed to load global stats:', error);
        }
    },

    // Load user's badges
    async loadUserBadges() {
        try {
            const achievements = await GreenSprintDB.achievements.getUserAchievements(
                AuthService.getUser().id
            );

            const container = document.getElementById('user-badges');
            if (!container) return;

            if (achievements.length === 0) {
                container.innerHTML = '<p class="no-badges">Plant your first tree to earn badges!</p>';
                return;
            }

            container.innerHTML = achievements.map(a => `
                <div class="badge-item" title="${a.achievement?.description || ''}">
                    <span class="badge-icon">${CONFIG.BADGES[a.achievement_id]?.icon || '🌟'}</span>
                    <span class="badge-name">${a.achievement?.name || a.achievement_id}</span>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load badges:', error);
        }
    },

    // Load recent activity
    async loadRecentActivity() {
        try {
            const trees = await GreenSprintDB.trees.getByUser(AuthService.getUser().id);
            const recentTrees = trees.slice(0, 5);

            const container = document.getElementById('recent-activity');
            if (!container) return;

            if (recentTrees.length === 0) {
                container.innerHTML = `
                    <div class="no-activity">
                        <i class="fa fa-tree"></i>
                        <p>No trees planted yet. Start your journey!</p>
                        <a href="tree-tracker.html" class="btn btn-primary">Plant a Tree</a>
                    </div>
                `;
                return;
            }

            container.innerHTML = recentTrees.map(tree => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fa fa-leaf"></i>
                    </div>
                    <div class="activity-content">
                        <h4>${tree.species?.common_name || 'Tree'} planted</h4>
                        <p>${tree.campaign?.campaign_name || 'Personal planting'}</p>
                        <span class="activity-date">${this.formatDate(tree.created_at)}</span>
                    </div>
                    <div class="activity-points">+${CONFIG.POINTS.TREE_PLANTED} pts</div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load recent activity:', error);
        }
    },

    // Load user campaigns
    async loadUserCampaigns() {
        try {
            const campaigns = await GreenSprintDB.campaigns.getUserCampaigns(
                AuthService.getUser().id
            );

            const container = document.getElementById('my-campaigns');
            if (!container) return;

            if (campaigns.length === 0) {
                container.innerHTML = `
                    <div class="no-campaigns">
                        <i class="fa fa-bullhorn"></i>
                        <p>You haven't created any campaigns yet.</p>
                        <a href="campaigns.html#create" class="btn btn-secondary">Create Campaign</a>
                    </div>
                `;
                return;
            }

            container.innerHTML = campaigns.map(c => `
                <div class="campaign-card mini" onclick="window.location.href='campaign-details.html?id=${c.id}'">
                    <div class="campaign-progress">
                        <div class="progress-bar" style="width: ${(c.trees_planted / c.target_trees * 100)}%"></div>
                    </div>
                    <h4>${c.campaign_name}</h4>
                    <div class="campaign-stats">
                        <span><i class="fa fa-tree"></i> ${c.trees_planted}/${c.target_trees}</span>
                        <span class="status ${c.status}">${c.status}</span>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }
    },

    // Load user trees
    async loadUserTrees() {
        try {
            const trees = await GreenSprintDB.trees.getByUser(AuthService.getUser().id);

            const container = document.getElementById('my-trees-list');
            if (!container) return;

            if (trees.length === 0) {
                container.innerHTML = `
                    <div class="no-trees">
                        <i class="fa fa-seedling"></i>
                        <p>Your tree collection is empty.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = trees.slice(0, 8).map(tree => `
                <div class="tree-card" onclick="DashboardModule.showTreeDetails('${tree.id}')">
                    <div class="tree-image">
                        <img src="${tree.photo_url || 'assets/images/default-tree.jpg'}" alt="Tree">
                        <span class="health-status ${tree.health_status}">${tree.health_status}</span>
                    </div>
                    <div class="tree-info">
                        <h4>${tree.species?.common_name || 'Tree'}</h4>
                        <p>Planted: ${this.formatDate(tree.planting_date)}</p>
                        <div class="tree-impact">
                            <span><i class="fa fa-cloud"></i> ${tree.co2_sequestered_kg || 0} kg CO₂</span>
                        </div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load trees:', error);
        }
    },

    // Initialize charts
    initCharts() {
        this.initTreesChart();
        this.initImpactChart();
        this.initSpeciesChart();
    },

    // Trees over time chart
    async initTreesChart() {
        const ctx = document.getElementById('trees-chart');
        if (!ctx) return;

        try {
            const data = await GreenSprintDB.analytics.getTreesOverTime(30);
            
            // Group by date
            const dailyCount = {};
            data.forEach(tree => {
                const date = tree.created_at.split('T')[0];
                dailyCount[date] = (dailyCount[date] || 0) + 1;
            });

            const labels = Object.keys(dailyCount).sort();
            const values = labels.map(d => dailyCount[d]);

            this.charts.trees = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels.map(d => this.formatDateShort(d)),
                    datasets: [{
                        label: 'Trees Planted',
                        data: values,
                        borderColor: '#2d5a27',
                        backgroundColor: 'rgba(45, 90, 39, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Failed to init trees chart:', error);
        }
    },

    // Environmental impact chart
    async initImpactChart() {
        const ctx = document.getElementById('impact-chart');
        if (!ctx) return;

        const profile = AuthService.getProfile();
        const trees = profile?.total_trees_planted || 0;
        const impact = this.calculateImpact(trees);

        this.charts.impact = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['CO₂ Absorbed', 'Water Filtered', 'Oxygen Produced'],
                datasets: [{
                    data: [impact.co2, impact.water / 10, impact.oxygen],
                    backgroundColor: [
                        '#2d5a27',
                        '#4a9c3f',
                        '#7bc96f'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                cutout: '60%'
            }
        });
    },

    // Species distribution chart
    async initSpeciesChart() {
        const ctx = document.getElementById('species-chart');
        if (!ctx) return;

        try {
            const distribution = await GreenSprintDB.analytics.getSpeciesDistribution();
            
            const labels = Object.keys(distribution).slice(0, 5);
            const values = labels.map(l => distribution[l]);

            this.charts.species = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Trees by Species',
                        data: values,
                        backgroundColor: '#4a9c3f'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Failed to init species chart:', error);
        }
    },

    // Initialize real-time updates
    initRealtime() {
        GreenSprintDB.realtime.subscribeToLeaderboard((payload) => {
            console.log('Leaderboard updated:', payload);
            this.loadGlobalStats();
        });
    },

    // Calculate environmental impact
    calculateImpact(treeCount) {
        return {
            co2: Math.round(treeCount * CONFIG.IMPACT.CO2_KG_PER_TREE),
            water: Math.round(treeCount * CONFIG.IMPACT.WATER_LITERS_PER_TREE),
            oxygen: Math.round(treeCount * CONFIG.IMPACT.OXYGEN_KG_PER_TREE),
            pollutants: Math.round(treeCount * CONFIG.IMPACT.AIR_POLLUTANTS_G_PER_TREE)
        };
    },

    // Show tree details modal
    async showTreeDetails(treeId) {
        // Open tree details page or modal
        window.location.href = `tree-details.html?id=${treeId}`;
    },

    // Format number with commas
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    // Format date
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    // Format date short
    formatDateShort(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
};

// Campaigns Module
const CampaignsModule = {
    campaigns: [],
    filters: {
        status: 'all',
        objective: 'all'
    },

    // Initialize campaigns page
    async init() {
        await this.loadCampaigns();
        this.bindEvents();
    },

    // Load campaigns
    async loadCampaigns() {
        try {
            const filters = {};
            if (this.filters.status !== 'all') filters.status = this.filters.status;
            if (this.filters.objective !== 'all') filters.objective = this.filters.objective;

            this.campaigns = await GreenSprintDB.campaigns.getAll(filters);
            this.renderCampaigns();
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }
    },

    // Render campaigns
    renderCampaigns() {
        const container = document.getElementById('campaigns-grid');
        if (!container) return;

        if (this.campaigns.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fa fa-search"></i>
                    <p>No campaigns found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.campaigns.map(c => this.renderCampaignCard(c)).join('');
    },

    // Render single campaign card
    renderCampaignCard(campaign) {
        const progress = Math.round((campaign.trees_planted / campaign.target_trees) * 100);
        
        return `
            <div class="campaign-card" onclick="window.location.href='campaign-details.html?id=${campaign.id}'">
                <div class="campaign-image">
                    <img src="${campaign.campaign_image_url || 'assets/images/default-campaign.jpg'}" alt="${campaign.campaign_name}">
                    <span class="campaign-status ${campaign.status}">${campaign.status}</span>
                </div>
                <div class="campaign-content">
                    <h3>${campaign.campaign_name}</h3>
                    <p class="campaign-organizer">
                        <img src="${campaign.organizer?.avatar_url || 'assets/images/default-avatar.png'}" alt="Organizer">
                        ${campaign.organizer?.full_name || 'Anonymous'}
                    </p>
                    <p class="campaign-description">${campaign.description?.substring(0, 100)}...</p>
                    <div class="campaign-progress-container">
                        <div class="progress-info">
                            <span>${campaign.trees_planted} / ${campaign.target_trees} trees</span>
                            <span>${progress}%</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="campaign-meta">
                        <span><i class="fa fa-calendar"></i> ${this.formatDate(campaign.start_date)}</span>
                        <span><i class="fa fa-map-marker"></i> ${campaign.location?.address || 'Global'}</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Bind events
    bindEvents() {
        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.filterType;
                const value = e.target.dataset.filter;
                this.setFilter(type, value);
            });
        });

        // Search
        const searchInput = document.getElementById('campaign-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchCampaigns(e.target.value);
            });
        }
    },

    // Set filter
    setFilter(type, value) {
        this.filters[type] = value;
        this.loadCampaigns();

        // Update active state
        document.querySelectorAll(`[data-filter-type="${type}"]`).forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === value) {
                btn.classList.add('active');
            }
        });
    },

    // Search campaigns
    searchCampaigns(query) {
        if (query.length < 2) {
            this.renderCampaigns();
            return;
        }

        const filtered = this.campaigns.filter(c => 
            c.campaign_name.toLowerCase().includes(query.toLowerCase()) ||
            c.description?.toLowerCase().includes(query.toLowerCase())
        );

        const container = document.getElementById('campaigns-grid');
        if (container) {
            container.innerHTML = filtered.map(c => this.renderCampaignCard(c)).join('');
        }
    },

    // Format date
    formatDate(dateStr) {
        if (!dateStr) return 'TBD';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
};

// Leaderboard Module
const LeaderboardModule = {
    async init() {
        await this.loadLeaderboard();
        this.initRealtime();
    },

    async loadLeaderboard() {
        try {
            const leaders = await GreenSprintDB.users.getLeaderboard(50);
            this.renderLeaderboard(leaders);
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
    },

    renderLeaderboard(leaders) {
        const container = document.getElementById('leaderboard-list');
        if (!container) return;

        container.innerHTML = leaders.map((user, index) => `
            <div class="leaderboard-item ${index < 3 ? 'top-' + (index + 1) : ''}">
                <div class="rank">
                    ${index < 3 ? this.getRankIcon(index + 1) : index + 1}
                </div>
                <div class="user-info">
                    <img src="${user.avatar_url || 'assets/images/default-avatar.png'}" alt="${user.username}">
                    <div class="user-details">
                        <h4>${user.full_name || user.username}</h4>
                        <span>@${user.username}</span>
                    </div>
                </div>
                <div class="user-stats">
                    <div class="stat">
                        <i class="fa fa-tree"></i>
                        <span>${user.total_trees_planted}</span>
                    </div>
                    <div class="stat points">
                        <i class="fa fa-star"></i>
                        <span>${this.formatNumber(user.total_points)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    getRankIcon(rank) {
        const icons = {
            1: '🥇',
            2: '🥈',
            3: '🥉'
        };
        return icons[rank] || rank;
    },

    initRealtime() {
        GreenSprintDB.realtime.subscribeToLeaderboard(() => {
            this.loadLeaderboard();
        });
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
};

// Profile Module
const ProfileModule = {
    async init() {
        if (!AuthService.isLoggedIn()) {
            window.location.href = 'login.html';
            return;
        }
        await this.loadProfile();
        this.bindEvents();
    },

    async loadProfile() {
        const profile = AuthService.getProfile();
        if (!profile) return;

        // Populate form fields
        document.getElementById('profile-avatar-img').src = profile.avatar_url || 'assets/images/default-avatar.png';
        document.getElementById('profile-fullname').value = profile.full_name || '';
        document.getElementById('profile-username').value = profile.username || '';
        document.getElementById('profile-email').value = profile.email || '';
        document.getElementById('profile-bio').value = profile.bio || '';
        document.getElementById('profile-location').value = profile.location || '';
        document.getElementById('profile-phone').value = profile.phone || '';

        // Stats
        document.getElementById('profile-trees').textContent = profile.total_trees_planted || 0;
        document.getElementById('profile-points').textContent = this.formatNumber(profile.total_points || 0);
        document.getElementById('profile-joined').textContent = this.formatDate(profile.created_at);
    },

    bindEvents() {
        // Avatar upload
        const avatarInput = document.getElementById('avatar-upload');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => this.uploadAvatar(e.target.files[0]));
        }

        // Profile form
        const form = document.getElementById('profile-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfile();
            });
        }
    },

    async uploadAvatar(file) {
        if (!file) return;

        try {
            const url = await GreenSprintDB.storage.uploadAvatar(AuthService.getUser().id, file);
            await GreenSprintDB.users.updateProfile(AuthService.getUser().id, { avatar_url: url });
            document.getElementById('profile-avatar-img').src = url;
            await AuthService.loadProfile();
            alert('Avatar updated successfully!');
        } catch (error) {
            console.error('Avatar upload failed:', error);
            alert('Failed to upload avatar');
        }
    },

    async saveProfile() {
        try {
            const updates = {
                full_name: document.getElementById('profile-fullname').value,
                bio: document.getElementById('profile-bio').value,
                location: document.getElementById('profile-location').value,
                phone: document.getElementById('profile-phone').value
            };

            await GreenSprintDB.users.updateProfile(AuthService.getUser().id, updates);
            await AuthService.loadProfile();
            alert('Profile updated successfully!');
        } catch (error) {
            console.error('Profile save failed:', error);
            alert('Failed to save profile');
        }
    },

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
};

// Export modules
window.DashboardModule = DashboardModule;
window.CampaignsModule = CampaignsModule;
window.LeaderboardModule = LeaderboardModule;
window.ProfileModule = ProfileModule;
