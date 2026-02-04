/**
 * Green Sprint - QR Scanner Module
 * Handles QR code scanning, generation, and tree registration
 */

const QRScannerModule = {
    scanner: null,
    isScanning: false,
    currentCamera: 'environment',

    // Initialize scanner
    async init(containerId = 'qr-reader') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('QR reader container not found');
            return false;
        }

        // Load html5-qrcode library if not loaded
        if (typeof Html5Qrcode === 'undefined') {
            console.error('Html5Qrcode library not loaded');
            return false;
        }

        this.scanner = new Html5Qrcode(containerId);
        return true;
    },

    // Start scanning
    async startScanning(onSuccess, onError) {
        if (!this.scanner) {
            console.error('Scanner not initialized');
            return;
        }

        if (this.isScanning) {
            console.log('Already scanning');
            return;
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        try {
            await this.scanner.start(
                { facingMode: this.currentCamera },
                config,
                async (decodedText, decodedResult) => {
                    console.log('QR Code detected:', decodedText);
                    await this.handleScan(decodedText, onSuccess);
                },
                (errorMessage) => {
                    // Ignore continuous scanning errors
                }
            );
            this.isScanning = true;
            console.log('Scanner started');
        } catch (error) {
            console.error('Failed to start scanner:', error);
            if (onError) onError(error);
        }
    },

    // Stop scanning
    async stopScanning() {
        if (this.scanner && this.isScanning) {
            try {
                await this.scanner.stop();
                this.isScanning = false;
                console.log('Scanner stopped');
            } catch (error) {
                console.error('Failed to stop scanner:', error);
            }
        }
    },

    // Switch camera
    async switchCamera() {
        this.currentCamera = this.currentCamera === 'environment' ? 'user' : 'environment';
        if (this.isScanning) {
            await this.stopScanning();
            await this.startScanning();
        }
    },

    // Handle scanned QR code
    async handleScan(qrCodeData, callback) {
        try {
            console.log('Processing scanned QR:', qrCodeData);
            
            // Parse QR code data
            const qrInfo = this.parseQRCode(qrCodeData);
            console.log('Parsed QR info:', qrInfo);
            
            if (!qrInfo.valid) {
                throw new Error('Invalid QR code format. This doesn\'t appear to be a Green Sprint QR code.');
            }

            let tree = null;

            // Try different methods to find the tree
            
            // 1. Try by QR code ID (GS-XXX format)
            if (qrInfo.id && qrInfo.id.startsWith('GS-')) {
                tree = await GreenSprintDB.trees.getByQRCode(qrInfo.id);
            }
            
            // 2. Try by tree ID from URL data
            if (!tree && qrInfo.data?.tree_id) {
                tree = await GreenSprintDB.trees.getById(qrInfo.data.tree_id);
            }
            
            // 3. Try by qr_code_id from URL data
            if (!tree && qrInfo.data?.qr_code_id) {
                tree = await GreenSprintDB.trees.getByQRCode(qrInfo.data.qr_code_id);
            }
            
            // 4. If UUID type, try as tree ID directly
            if (!tree && qrInfo.type === 'uuid') {
                tree = await GreenSprintDB.trees.getById(qrInfo.id);
            }
            
            // 5. Last resort - try the ID as both QR code ID and tree ID
            if (!tree) {
                tree = await GreenSprintDB.trees.getByQRCode(qrInfo.id);
            }
            if (!tree) {
                tree = await GreenSprintDB.trees.getById(qrInfo.id);
            }

            if (!tree) {
                throw new Error('Tree not found. This QR code may not be registered yet or the tree was deleted.');
            }

            // Record the scan if user is logged in
            if (AuthService.isLoggedIn()) {
                try {
                    const location = await this.getCurrentLocation();
                    await GreenSprintDB.qrCodes.recordScan(
                        tree.qr_code_id || qrInfo.id,
                        AuthService.getUser().id,
                        location
                    );
                } catch (recordError) {
                    console.warn('Could not record scan:', recordError);
                }
            }

            // Stop scanning
            await this.stopScanning();

            // Call success callback
            if (callback) {
                callback({
                    success: true,
                    tree: tree,
                    qrCode: { id: tree.qr_code_id || qrInfo.id },
                    message: 'Tree found successfully!'
                });
            }

        } catch (error) {
            console.error('Scan handling error:', error);
            if (callback) {
                callback({
                    success: false,
                    error: error.message
                });
            }
        }
    },

    // Parse QR code data
    parseQRCode(data) {
        console.log('Parsing QR data:', data);
        
        try {
            // Try JSON parse first
            if (data.startsWith('{')) {
                const parsed = JSON.parse(data);
                return {
                    valid: true,
                    id: parsed.id || parsed.qr_code_id,
                    type: 'json',
                    data: parsed
                };
            }

            // Check Green Sprint format (GS-TIMESTAMP-RANDOMID)
            if (data.startsWith('GS-')) {
                return {
                    valid: true,
                    id: data,
                    type: 'gs_format'
                };
            }

            // Check URL format - parse tree-details.html?id=XXX&qr=YYY
            if (data.includes('http') || data.includes('tree-details')) {
                try {
                    const url = new URL(data);
                    const treeId = url.searchParams.get('id');
                    const qrCodeId = url.searchParams.get('qr');
                    
                    // Prefer QR code ID if available, otherwise use tree ID
                    const id = qrCodeId || treeId || url.pathname.split('/').pop();
                    
                    return {
                        valid: true,
                        id: id,
                        type: 'url',
                        data: {
                            tree_id: treeId,
                            qr_code_id: qrCodeId
                        }
                    };
                } catch (urlError) {
                    // Not a valid URL, continue
                }
            }

            // Check if it's a UUID (tree ID directly)
            if (data.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                return {
                    valid: true,
                    id: data,
                    type: 'uuid',
                    data: { tree_id: data }
                };
            }

            return { valid: false, error: 'Unknown QR code format. Expected Green Sprint QR.' };
        } catch (error) {
            console.error('Parse error:', error);
            return { valid: false, error: error.message };
        }
    },

    // Get current location
    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        });
    },

    // Generate QR code ID for a tree
    generateQRCode(treeId, campaignId, options = {}) {
        const qrCodeId = `GS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
        
        // Return just the QR code ID - the actual URL will be generated when rendering
        return {
            id: qrCodeId,
            tree_id: treeId,
            campaign_id: campaignId,
            created_at: new Date().toISOString()
        };
    },

    // Generate a scannable URL for the QR code
    getQRUrl(treeId, qrCodeId) {
        // Use the current origin for the URL
        const baseUrl = window.location.origin || 'https://greensprint.app';
        return `${baseUrl}/tree-details.html?id=${treeId}&qr=${qrCodeId}`;
    },

    // Render QR code to element - now uses URL format for external scanner compatibility
    async renderQRCode(elementId, data, size = 200) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Clear previous
        element.innerHTML = '';

        // Determine the QR content - prefer URL format for external scanner compatibility
        let qrContent;
        if (typeof data === 'string') {
            qrContent = data;
        } else if (data.tree_id && data.id) {
            // Generate a scannable URL
            qrContent = this.getQRUrl(data.tree_id, data.id);
        } else if (data.url) {
            qrContent = data.url;
        } else {
            // Fallback to the QR code ID
            qrContent = data.id || JSON.stringify(data);
        }
        
        console.log('Rendering QR with content:', qrContent);

        // Use QRCode library if available
        if (typeof QRCode !== 'undefined') {
            new QRCode(element, {
                text: qrContent,
                width: size,
                height: size,
                colorDark: '#2d5a27',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            // Fallback: use API
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrContent)}`;
            element.innerHTML = `<img src="${qrUrl}" alt="QR Code" width="${size}" height="${size}">`;
        }
    }
};

// Tree Registration Form Handler
const TreeRegistrationHandler = {
    currentStep: 1,
    formData: {},
    location: null,

    // Initialize registration form
    init() {
        this.bindEvents();
        this.getCurrentLocation();
    },

    // Bind form events
    bindEvents() {
        // Step navigation
        document.querySelectorAll('[data-step]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const step = parseInt(e.target.dataset.step);
                this.goToStep(step);
            });
        });

        // Form submission
        const form = document.getElementById('tree-registration-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitTree();
            });
        }

        // Photo upload
        const photoInput = document.getElementById('tree-photo');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                this.handlePhotoUpload(e.target.files[0]);
            });
        }

        // Species search
        const speciesInput = document.getElementById('species-search');
        if (speciesInput) {
            speciesInput.addEventListener('input', (e) => {
                this.searchSpecies(e.target.value);
            });
        }
    },

    // Go to step
    goToStep(step) {
        // Validate current step before proceeding
        if (step > this.currentStep && !this.validateStep(this.currentStep)) {
            return;
        }

        // Hide current step
        document.querySelectorAll('.form-step').forEach(el => {
            el.classList.remove('active');
        });

        // Show new step
        const newStep = document.querySelector(`.form-step[data-step="${step}"]`);
        if (newStep) {
            newStep.classList.add('active');
            this.currentStep = step;
        }

        // Update progress
        this.updateProgress();
    },

    // Validate step
    validateStep(step) {
        switch (step) {
            case 1:
                return this.formData.campaign_id !== undefined;
            case 2:
                return this.formData.species_id !== undefined;
            case 3:
                return this.location !== null;
            case 4:
                return this.formData.photo !== undefined;
            default:
                return true;
        }
    },

    // Update progress indicator
    updateProgress() {
        const progress = (this.currentStep / 5) * 100;
        const progressBar = document.getElementById('registration-progress');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        // Update step indicators
        document.querySelectorAll('.step-indicator').forEach((el, index) => {
            if (index + 1 <= this.currentStep) {
                el.classList.add('completed');
            } else {
                el.classList.remove('completed');
            }
        });
    },

    // Get current location
    async getCurrentLocation() {
        this.location = await QRScannerModule.getCurrentLocation();
        if (this.location) {
            this.updateLocationDisplay();
        }
    },

    // Update location display
    updateLocationDisplay() {
        const locationEl = document.getElementById('current-location');
        if (locationEl && this.location) {
            locationEl.innerHTML = `
                <i class="fa fa-map-marker"></i>
                Lat: ${this.location.latitude.toFixed(6)}, 
                Long: ${this.location.longitude.toFixed(6)}
            `;
        }
    },

    // Handle photo upload
    async handlePhotoUpload(file) {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be less than 5MB');
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('photo-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);

        this.formData.photo = file;
    },

    // Search species
    async searchSpecies(query) {
        if (query.length < 2) return;

        try {
            const species = await GreenSprintDB.species.search(query);
            this.displaySpeciesResults(species);
        } catch (error) {
            console.error('Species search error:', error);
        }
    },

    // Display species results
    displaySpeciesResults(species) {
        const container = document.getElementById('species-results');
        if (!container) return;

        container.innerHTML = species.map(s => `
            <div class="species-item" data-id="${s.id}" onclick="TreeRegistrationHandler.selectSpecies('${s.id}', '${s.common_name}')">
                <strong>${s.common_name}</strong>
                <small>${s.scientific_name}</small>
            </div>
        `).join('');
    },

    // Select species
    selectSpecies(id, name) {
        this.formData.species_id = id;
        const input = document.getElementById('species-search');
        if (input) {
            input.value = name;
        }
        document.getElementById('species-results').innerHTML = '';
    },

    // Submit tree
    async submitTree() {
        if (!AuthService.isLoggedIn()) {
            alert('Please log in to register a tree');
            window.location.href = 'login.html';
            return;
        }

        // Get fresh location before submitting
        if (!this.location) {
            await this.getCurrentLocation();
        }

        try {
            // Show loading
            this.showLoading(true);

            // Gather form data
            const form = document.getElementById('tree-registration-form');
            const formData = new FormData(form);

            // Generate unique QR code ID first
            const qrCodeId = GreenSprintDB.qrCodes.generateId();

            // Prepare location data
            const locationData = this.location ? {
                type: 'Point',
                coordinates: [this.location.longitude, this.location.latitude]
            } : null;

            // Create tree record first (without photo)
            const treeData = {
                campaign_id: this.formData.campaign_id || null,
                species_id: this.formData.species_id,
                planter_id: AuthService.getUser().id,
                qr_code_id: qrCodeId,
                location: locationData,
                latitude: this.location?.latitude || null,
                longitude: this.location?.longitude || null,
                planting_date: new Date().toISOString().split('T')[0],
                photo_url: null,
                health_status: 'healthy',
                survival_status: true,
                notes: formData.get('notes') || ''
            };

            console.log('Creating tree with data:', treeData);
            const tree = await GreenSprintDB.trees.create(treeData);
            
            if (!tree || !tree.id) {
                throw new Error('Failed to create tree record');
            }
            
            console.log('Tree created:', tree);

            // Upload photo with tree ID (optional - continue even if fails)
            let photoUrl = null;
            if (this.formData.photo && this.formData.photo instanceof File) {
                try {
                    console.log('Uploading photo for tree:', tree.id);
                    photoUrl = await GreenSprintDB.trees.uploadPhoto(tree.id, this.formData.photo);
                    if (photoUrl) {
                        await GreenSprintDB.trees.update(tree.id, { photo_url: photoUrl });
                        console.log('Photo uploaded:', photoUrl);
                    }
                } catch (photoError) {
                    console.warn('Photo upload failed (continuing without photo):', photoError);
                }
            }

            // Update user stats
            try {
                await GreenSprintDB.users.incrementTreeCount(AuthService.getUser().id);
                await GreenSprintDB.users.addPoints(
                    AuthService.getUser().id,
                    CONFIG.POINTS?.TREE_PLANTED || 50,
                    'Planted a tree'
                );
            } catch (statsError) {
                console.warn('Stats update error:', statsError);
            }

            // Check for badge achievements
            try {
                const profile = await GreenSprintDB.users.getProfile(AuthService.getUser().id);
                await GreenSprintDB.achievements.checkAndAward(
                    AuthService.getUser().id,
                    profile?.trees_planted || 1
                );
            } catch (badgeError) {
                console.warn('Badge check error:', badgeError);
            }

            // Show success
            this.showSuccess(tree, { id: qrCodeId, url: `${window.location.origin}/tree-details.html?id=${tree.id}` });

        } catch (error) {
            console.error('Tree registration error:', error);
            alert('Failed to register tree: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    // Show loading state
    showLoading(show) {
        const loader = document.getElementById('registration-loader');
        const form = document.getElementById('tree-registration-form');
        
        if (loader) loader.style.display = show ? 'flex' : 'none';
        if (form) form.style.opacity = show ? '0.5' : '1';
    },

    // Show success
    showSuccess(tree, qrData) {
        const successModal = document.getElementById('success-modal');
        if (successModal) {
            // Render QR code
            QRScannerModule.renderQRCode('generated-qr-code', qrData.url, 200);
            
            // Show modal
            successModal.style.display = 'flex';
            
            // Update stats display
            document.getElementById('new-tree-id').textContent = tree.id.substr(0, 8);
            document.getElementById('points-earned').textContent = CONFIG.POINTS.TREE_PLANTED;
        }
    }
};

// Export
window.QRScannerModule = QRScannerModule;
window.TreeRegistrationHandler = TreeRegistrationHandler;
