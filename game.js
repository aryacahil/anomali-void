window.addEventListener('DOMContentLoaded', () => {

    // ===== PENGATURAN DASAR & VARIABEL GAME =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 10, 30);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 0);

    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const textureLoader = new THREE.TextureLoader();

    const ambientLight = new THREE.AmbientLight(0x505050, 1.0);
    scene.add(ambientLight);

    const playerLight = new THREE.SpotLight(0xffffff, 3.0, 40, Math.PI / 6, 0.4, 1.5);
    playerLight.position.set(0, 0, 0);
    camera.add(playerLight);

    const lightTarget = new THREE.Object3D();
    scene.add(lightTarget);
    playerLight.target = lightTarget;
    scene.add(camera);

    let chosenGhosts = [];
    let gameStarted = false;
    let gameOver = false;
    let walls = [];
    let ghosts = [];

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
        const mapSize = 25;
        const wallSize = 4;
        const map = Array(mapSize).fill(0).map(() => Array(mapSize).fill(1));

        function carve(cx, cy) {
            const d = [[0,1],[0,-1],[1,0],[-1,0]];
            d.sort(() => Math.random() - 0.5);
            map[cy][cx] = 0;
            for (const [dx, dy] of d) {
                const nX = cx + dx * 2;
                const nY = cy + dy * 2;
                if (nY >= 0 && nY < mapSize && nX >= 0 && nX < mapSize && map[nY][nX] === 1) {
                    map[cy + dy][cx + dx] = 0;
                    carve(nX, nY);
                }
            }
        }
        carve(1, 1);

        const wallTexture = textureLoader.load('assets/wall.jpg');
        wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(1, 1);

        const floorTexture = textureLoader.load('assets/floor.jpg');
        floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(mapSize, mapSize);

        const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
        const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(mapSize * wallSize, mapSize * wallSize),
            floorMaterial
        );
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);

        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                if (map[y][x] === 1) {
                    const wall = new THREE.Mesh(
                        new THREE.BoxGeometry(wallSize, 6, wallSize),
                        wallMaterial
                    );
                    const worldX = (x - (mapSize - 1) / 2) * wallSize;
                    const worldZ = (y - (mapSize - 1) / 2) * wallSize;
                    wall.position.set(worldX, 3, worldZ);
                    scene.add(wall);
                    walls.push(wall);
                }
            }
        }

        const startX = (1 - (mapSize - 1) / 2) * wallSize;
        const startZ = (1 - (mapSize - 1) / 2) * wallSize;
        camera.position.set(startX, 1.7, startZ);
    }

    function updateGhostAI() {
        ghosts.forEach(ghostData => {
            const ghost = ghostData.mesh;
            const target = ghostData.target;
            const distanceToPlayer = ghost.position.distanceTo(camera.position);
            const raycaster = new THREE.Raycaster(ghost.position, camera.position.clone().sub(ghost.position).normalize());
            const intersects = raycaster.intersectObjects(walls);
            const canSeePlayer = intersects.length === 0 || intersects[0].distance > distanceToPlayer;

            if (canSeePlayer && distanceToPlayer < 15) {
                ghostData.state = 'chasing';
                target.copy(camera.position);
            } else if (ghostData.state === 'chasing') {
                ghostData.state = 'patrolling';
            }

            if (ghostData.state === 'patrolling') {
                if (ghost.position.distanceTo(target) < 2) {
                    target.set((Math.random() - 0.5) * 40, 1.5, (Math.random() - 0.5) * 40);
                }
            }

            const speed = ghostData.state === 'chasing' ? 0.05 : 0.02;
            ghost.lookAt(target);
            ghost.position.add(
                new THREE.Vector3().subVectors(target, ghost.position).normalize().multiplyScalar(speed)
            );
        });
    }

    const moveState = { forward: 0, right: 0 };
    const moveSpeed = 5.0;
    const lookSpeed = 0.004;
    const playerHitboxSize = 0.5;
    let euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const clock = new THREE.Clock();

    function setupControls() {
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
    }

    const ambianceSound = new Audio('assets/ambiance.mp3'); ambianceSound.loop = true; ambianceSound.volume = 0.3;
    const jumpscareSound = new Audio('assets/jumpscare.mp3');
    const footstepSound = new Audio('assets/footstep.mp3');
    let canPlayFootstep = true;

    document.getElementById('startButton').addEventListener('click', () => {
        startScreen.classList.add('hidden');
        charScreen.classList.remove('hidden');
    });

    document.querySelectorAll('.char-btn').forEach(button => {
        button.addEventListener('click', () => {
            button.classList.toggle('active');
            const ghostType = button.dataset.char;

            if (chosenGhosts.includes(ghostType)) {
                chosenGhosts = chosenGhosts.filter(g => g !== ghostType);
            } else {
                chosenGhosts.push(ghostType);
            }
        });
    });

    document.getElementById('playButton').addEventListener('click', () => {
        charScreen.classList.add('hidden');
        gameUI.classList.remove('hidden');
        renderer.domElement.style.display = 'block';
        setupControls();
        generateMaze();

        const ghostTextures = {
            pocong: 'assets/arya.jpg',
            kuntilanak: 'assets/kuntilanak.png'
        };

        chosenGhosts.forEach((ghostType, index) => {
    textureLoader.load(ghostTextures[ghostType], (texture) => {
        const ghost = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 3),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 })
        );

        const playerPos = camera.position;
        ghost.position.set(
            playerPos.x + (Math.random() * 20 - 5),
            1.5,
            playerPos.z + (Math.random() * 20 - 5)
        );

        scene.add(ghost);

        ghosts.push({
            mesh: ghost,
            state: 'patrolling',
            target: new THREE.Vector3()
        });
    });
});

        ambianceSound.play();
        gameStarted = true;
    });

    document.getElementById('restartButton').addEventListener('click', () => {
        window.location.reload();
    });

    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();

        if (gameStarted && !gameOver) {
            const moveDirection = new THREE.Vector3(moveState.right, 0, moveState.forward);
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            lightTarget.position.copy(camera.position).add(camDir);
            playerLight.target.updateMatrixWorld();

            if (moveDirection.lengthSq() > 0) {
                moveDirection.normalize();
                const worldDirection = moveDirection.clone().applyQuaternion(camera.quaternion);
                worldDirection.y = 0;
                worldDirection.normalize();

                const speed = moveSpeed * delta;

                const raycaster = new THREE.Raycaster(camera.position, worldDirection);
                const intersects = raycaster.intersectObjects(walls);

                if (intersects.length === 0 || intersects[0].distance > playerHitboxSize) {
                    camera.position.add(worldDirection.multiplyScalar(speed));
                }

                camera.position.y = 1.7;

                if (canPlayFootstep) {
                    footstepSound.currentTime = 0;
                    footstepSound.play().catch(() => {});
                    canPlayFootstep = false;
                    setTimeout(() => { canPlayFootstep = true; }, 450);
                }
            }

            updateGhostAI();

            ghosts.forEach(ghostData => {
                if (ghostData.mesh.position.distanceTo(camera.position) < 1.2) {
                    triggerJumpscare();
                }
            });
        }

        if (gameStarted) {
            composer.render(delta);
        }
    }

    function triggerJumpscare() {
        gameOver = true;
        document.pointerLockElement && document.exitPointerLock();
        renderer.domElement.style.display = 'none';
        jumpscareScreen.querySelector('img').src = ghosts[0]?.mesh?.material?.map?.image?.src || '';
        jumpscareScreen.classList.remove('hidden');
        gameUI.classList.add('hidden');
        ambianceSound.pause();
        jumpscareSound.play();
        setTimeout(() => {
            jumpscareScreen.classList.add('hidden');
            gameOverScreen.classList.remove('hidden');
        }, 1500);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
});