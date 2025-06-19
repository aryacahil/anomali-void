window.addEventListener('DOMContentLoaded', () => {

    // ===== PENGATURAN DASAR & VARIABEL GAME =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 10, 30); // Jarak pandang fog diperluas

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 0);

    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const textureLoader = new THREE.TextureLoader();

    // PERBAIKAN: Cahaya dijadikan seperti senter yang terang
    const ambientLight = new THREE.AmbientLight(0x505050, 1.0);
    scene.add(ambientLight);

    const playerLight = new THREE.SpotLight(0xffffff, 3.0, 40, Math.PI / 4, 0.4, 1.5);
    camera.add(playerLight);
    const lightTarget = new THREE.Object3D();
    camera.add(lightTarget);
    playerLight.target = lightTarget;
    // Set posisi target HANYA SATU KALI di sini.
    lightTarget.position.set(0, 0, -1);
    scene.add(camera);

    let chosenGhost = 'pocong';
    let gameStarted = false;
    let gameOver = false;
    let walls = [];

    const startScreen = document.getElementById('startScreen');
    const charScreen = document.getElementById('characterSelectionScreen');
    const gameUI = document.getElementById('ui');
    const jumpscareScreen = document.getElementById('jumpscare');
    const gameOverScreen = document.getElementById('gameOverScreen');

    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const glitchPass = new THREE.GlitchPass();
    composer.addPass(glitchPass);

    function generateMaze() {
        const mapSize = 25; const wallSize = 4;
        const map = Array(mapSize).fill(0).map(() => Array(mapSize).fill(1));
        function carve(cx,cy){const d=[[0,1],[0,-1],[1,0],[-1,0]];d.sort(()=>Math.random()-.5);map[cy][cx]=0;for(const[dx,dy]of d){const nX=cx+dx*2,nY=cy+dy*2;if(nY>=0&&nY<mapSize&&nX>=0&&nX<mapSize&&map[nY][nX]===1){map[cy+dy][cx+dx]=0;carve(nX,nY)}}}carve(1,1);
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapSize * wallSize, mapSize * wallSize), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        for (let y = 0; y < mapSize; y++) { for (let x = 0; x < mapSize; x++) { if (map[y][x] === 1) { const wall = new THREE.Mesh(new THREE.BoxGeometry(wallSize, 6, wallSize), wallMaterial); const worldX = (x - (mapSize - 1) / 2) * wallSize; const worldZ = (y - (mapSize - 1) / 2) * wallSize; wall.position.set(worldX, 3, worldZ); scene.add(wall); walls.push(wall); } } }
        const startX = (1 - (mapSize - 1) / 2) * wallSize;
        const startZ = (1 - (mapSize - 1) / 2) * wallSize;
        camera.position.set(startX, 1.7, startZ);
    }

    const ghost = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 }));
    scene.add(ghost);
    const GHOST_STATE = { PATROLLING: 'patrolling', CHASING: 'chasing' };
    const ghostAI = { state: GHOST_STATE.PATROLLING, speed: 0.03, targetPosition: new THREE.Vector3(), };
    function updateGhostAI() {
        const distanceToPlayer = ghost.position.distanceTo(camera.position); const raycaster = new THREE.Raycaster(ghost.position, camera.position.clone().sub(ghost.position).normalize()); const intersects = raycaster.intersectObjects(walls); const canSeePlayer = intersects.length === 0 || intersects[0].distance > distanceToPlayer;
        if (canSeePlayer && distanceToPlayer < 15) { if (ghostAI.state === GHOST_STATE.PATROLLING) { ghostAI.state = GHOST_STATE.CHASING; } } else { if (ghostAI.state === GHOST_STATE.CHASING) { ghostAI.state = GHOST_STATE.PATROLLING; } }
        switch (ghostAI.state) { case GHOST_STATE.CHASING: ghostAI.speed = 0.05; ghostAI.targetPosition.copy(camera.position); break; case GHOST_STATE.PATROLLING: ghostAI.speed = 0.02; if (ghost.position.distanceTo(ghostAI.targetPosition) < 2) { ghostAI.targetPosition.set((Math.random() - 0.5) * 40, 1.5, (Math.random() - 0.5) * 40); } break; }
        ghost.lookAt(ghostAI.targetPosition); ghost.position.addScaledVector( new THREE.Vector3().subVectors(ghostAI.targetPosition, ghost.position).normalize(), ghostAI.speed );
        if (Math.random() > 0.98) { ghost.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1); } else { ghost.scale.set(1, 1, 1); }
    }

    // ===== KONTROL PEMAIN =====
    const moveState = { forward: 0, right: 0 };
    const moveSpeed = 5.0;
    const lookSpeed = 0.004; // Sensitivitas dinaikkan
    const playerHitboxSize = 0.5;
    let euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const clock = new THREE.Clock();

    function setupControls() {
        // PERBAIKAN: Listener untuk mengunci kursor saat kanvas di klik
        renderer.domElement.addEventListener('click', () => {
            document.body.requestPointerLock();
        });

        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.body) {
                euler.y -= event.movementX * lookSpeed;
                euler.x -= event.movementY * lookSpeed;
                euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
                camera.quaternion.setFromEuler(euler);
            }
        });

        let lastTouchX = 0, lastTouchY = 0;
        renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches[0].clientX > window.innerWidth / 3) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            }
        }, { passive: true });
        renderer.domElement.addEventListener('touchmove', (e) => {
            if (e.touches[0].clientX > window.innerWidth / 3) {
                const dx = e.touches[0].clientX - lastTouchX; const dy = e.touches[0].clientY - lastTouchY;
                euler.y -= dx * lookSpeed * 2; euler.x -= dy * lookSpeed * 2;
                euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
                camera.quaternion.setFromEuler(euler);
                lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
            }
        });

        // PERBAIKAN: Kontrol maju/mundur dibalik
        window.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'KeyW': moveState.forward = -1; break;
                case 'KeyS': moveState.forward = 1; break;
                case 'KeyA': moveState.right = -1; break;
                case 'KeyD': moveState.right = 1; break;
            }
        });
        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': case 'KeyS': moveState.forward = 0; break;
                case 'KeyA': case 'KeyD': moveState.right = 0; break;
            }
        });

        const addTouchListener = (id, stateKey, value) => {
            const btn = document.getElementById(id);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveState[stateKey] = value; }, { passive: false });
            btn.addEventListener('touchend', () => { moveState[stateKey] = 0; });
        };
        // PERBAIKAN: Kontrol tombol maju/mundur dibalik
        addTouchListener('btnUp', 'forward', -1);
        addTouchListener('btnDown', 'forward', 1);
        addTouchListener('btnLeft', 'right', -1);
        addTouchListener('btnRight', 'right', 1);
    }
    
    const ambianceSound = new Audio('assets/ambiance.mp3'); ambianceSound.loop = true; ambianceSound.volume = 0.3;
    const jumpscareSound = new Audio('assets/jumpscare.mp3');
    const footstepSound = new Audio('assets/footstep.mp3');
    let canPlayFootstep = true;

    document.getElementById('startButton').addEventListener('click', () => {
        startScreen.classList.add('hidden');
        charScreen.classList.remove('hidden');
        document.querySelector(`.char-btn[data-char="${chosenGhost}"]`).classList.add('active');
    });
    document.querySelectorAll('.char-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.char-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            chosenGhost = button.dataset.char;
        });
    });
    document.getElementById('playButton').addEventListener('click', () => {
        charScreen.classList.add('hidden');
        gameUI.classList.remove('hidden');
        renderer.domElement.style.display = 'block';
        // PERBAIKAN: Pindahkan pemanggilan setupControls ke sini
        setupControls();
        generateMaze();
        const ghostTextures = { pocong: 'assets/arya.jpg', kuntilanak: 'assets/kuntilanak.png' };
        textureLoader.load(ghostTextures[chosenGhost], (texture) => {
            ghost.material.map = texture;
            ghost.material.needsUpdate = true;
        });
        ghost.position.set(20, 1.5, 20);
        ghostAI.targetPosition.copy(ghost.position);
        ambianceSound.play();
        gameStarted = true;
    });
    document.getElementById('restartButton').addEventListener('click', () => { window.location.reload(); });

    // ===== GAME LOOP & JUMPSCARE (DENGAN PERBAIKAN TABRAKAN) =====
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();

        if (gameStarted && !gameOver) {
            // PERBAIKAN: Logika deteksi tabrakan yang lebih baik
            const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward);
            // Hanya bergerak jika ada input
            if (moveDirection.lengthSq() > 0) { // lengthSq lebih efisien dari length()
                moveDirection.normalize();
                const worldDirection = moveDirection.clone().applyQuaternion(camera.quaternion);
                const speed = moveSpeed * delta;

                const raycaster = new THREE.Raycaster(camera.position, worldDirection);
                const intersects = raycaster.intersectObjects(walls);

                if (intersects.length === 0 || intersects[0].distance > playerHitboxSize) {
                    camera.position.add(worldDirection.multiplyScalar(speed));
                }
                
                if (canPlayFootstep) {
                    /* footstepSound.currentTime = 0; footstepSound.play().catch(e => {}); canPlayFootstep = false; setTimeout(() => { canPlayFootstep = true; }, 450); */
                }
            }

            updateGhostAI();
            if (ghost.position.distanceTo(camera.position) < 1.2) {
                triggerJumpscare();
            }
        }
        if (gameStarted) {
            composer.render(delta);
        }
    }

    function triggerJumpscare() {
        gameOver = true; document.pointerLockElement && document.exitPointerLock();
        renderer.domElement.style.display = 'none';
        jumpscareScreen.querySelector('img').src = ghost.material.map.image.src;
        jumpscareScreen.classList.remove('hidden'); gameUI.classList.add('hidden');
        ambianceSound.pause(); jumpscareSound.play();
        setTimeout(() => {
            jumpscareScreen.classList.add('hidden');
            gameOverScreen.classList.remove('hidden');
        }, 1500);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
});