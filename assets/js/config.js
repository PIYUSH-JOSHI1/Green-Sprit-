/**
 * Green Sprint - Configuration File
 * Supabase credentials configured
 */

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://hjzwyxbywwxyhamdgftp.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhqend5eGJ5d3d4eWhhbWRnZnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjUzMzAsImV4cCI6MjA4NTgwMTMzMH0.1nUxyzroU3Py3gwV-auaD7_GbdpdMU2HmyhtrGOt3_g',
    
    // Backend API URL (Python Flask on Render)
    // ⚠️ CHANGE THIS after deploying backend to Render!
    BACKEND_API_URL: 'https://green-sprint-api.onrender.com',
    // For local testing: 'http://localhost:5000'
    
    // Application Settings
    APP_NAME: 'Green Sprint',
    APP_VERSION: '1.0.0',
    
    // Gamification Settings
    POINTS: {
        TREE_PLANTED: 100,
        TREE_VERIFIED: 50,
        CAMPAIGN_CREATED: 200,
        CAMPAIGN_JOINED: 25,
        DAILY_LOGIN: 10,
        STREAK_BONUS: 5,
        REFERRAL: 150,
        PHOTO_UPLOAD: 20,
        MILESTONE_10_TREES: 500,
        MILESTONE_50_TREES: 2000,
        MILESTONE_100_TREES: 5000
    },
    
    // Achievement Badges
    BADGES: {
        SEEDLING: { name: 'Seedling', trees: 1, icon: '🌱' },
        SAPLING: { name: 'Sapling', trees: 10, icon: '🌿' },
        TREE_HUGGER: { name: 'Tree Hugger', trees: 25, icon: '🌳' },
        FOREST_GUARDIAN: { name: 'Forest Guardian', trees: 50, icon: '🏕️' },
        ECO_WARRIOR: { name: 'Eco Warrior', trees: 100, icon: '🦸' },
        NATURE_CHAMPION: { name: 'Nature Champion', trees: 250, icon: '🏆' },
        EARTH_PROTECTOR: { name: 'Earth Protector', trees: 500, icon: '🌍' },
        CLIMATE_HERO: { name: 'Climate Hero', trees: 1000, icon: '🦸‍♂️' }
    },
    
    // Environmental Impact Calculations (per tree per year)
    IMPACT: {
        CO2_KG_PER_TREE: 22,           // Average CO2 absorbed per tree per year
        WATER_LITERS_PER_TREE: 400,    // Average water filtered per tree per year
        OXYGEN_KG_PER_TREE: 118,       // Average oxygen produced per tree per year
        AIR_POLLUTANTS_G_PER_TREE: 7   // Average air pollutants removed per tree per year
    },
    
    // Tree Species Categories
    TREE_CATEGORIES: [
        'Native',
        'Fruit',
        'Shade',
        'Flowering',
        'Evergreen',
        'Deciduous',
        'Medicinal',
        'Ornamental'
    ],
    
    // Campaign Status Options
    CAMPAIGN_STATUS: {
        DRAFT: 'draft',
        ACTIVE: 'active',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },
    
    // User Roles
    USER_ROLES: {
        MEMBER: 'member',
        ORGANIZER: 'organizer',
        DONOR: 'donor',
        ADMIN: 'admin'
    },
    
    // Tree Health Status
    TREE_HEALTH: {
        HEALTHY: 'healthy',
        NEEDS_CARE: 'needs_care',
        AT_RISK: 'at_risk',
        DECEASED: 'deceased'
    },
    
    // Pagination
    ITEMS_PER_PAGE: 12,
    
    // Map Settings
    MAP: {
        DEFAULT_CENTER: [20.5937, 78.9629], // India center
        DEFAULT_ZOOM: 5,
        TILE_LAYER: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    }
};

// Make config globally available
window.GREEN_SPRINT_CONFIG = CONFIG;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
