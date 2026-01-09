import * as THREE from 'three';

// State variables
let isAnimating = false;
let moveQueue = [];    
let historyStack = []; 
let redoStack = [];    
let isRotatingView = false, isDraggingSlice = false;
let startCubelet = null, startMousePos = new THREE.Vector2();
let lastMousePos = { x: 0, y: 0 };

const scene = new THREE.Scene();
const canvas = document.querySelector('#cube-canvas');
const container = document.querySelector('#cube-area');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(5, 5, 7);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// Cube setup
const cubeGroup = new THREE.Group();
const colors = [0xb71234, 0xff5800, 0x0046ad, 0x009b48, 0xffffff, 0xffd500]; 
const materials = colors.map(c => new THREE.MeshLambertMaterial({ color: c }));

for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
            const cubelet = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
            cubelet.position.set(x * 1.05, y * 1.05, z * 1.05);
            cubeGroup.add(cubelet);
        }
    }
}
scene.add(cubeGroup, new THREE.AmbientLight(0xffffff, 1.8));

const pointLight = new THREE.PointLight(0xffffff, 150);
pointLight.position.set(10, 10, 10);
scene.add(pointLight);

const moveMap = {
    'R': { axis: 'x', layer: 1.05, dir: -1 }, 'L': { axis: 'x', layer: -1.05, dir: 1 },
    'U': { axis: 'y', layer: 1.05, dir: -1 }, 'D': { axis: 'y', layer: -1.05, dir: 1 },
    'F': { axis: 'z', layer: 1.05, dir: -1 }, 'B': { axis: 'z', layer: -1.05, dir: 1 }
};

function rotateSlice(move) {
    if (isAnimating) return;
    isAnimating = true;
    const { axis, layer, dir } = move;
    const pivot = new THREE.Object3D();
    cubeGroup.add(pivot);

    const slice = cubeGroup.children.filter(c => c !== pivot && Math.abs(c.position[axis] - layer) < 0.1);
    if (slice.length !== 9) { cubeGroup.remove(pivot); isAnimating = false; return; }

    slice.forEach(c => pivot.attach(c));
    gsap.to(pivot.rotation, {
        [axis]: pivot.rotation[axis] + (Math.PI / 2) * dir,
        duration: 0.12, ease: "power1.inOut",
        onComplete: () => {
            slice.forEach(c => {
                cubeGroup.attach(c);
                ['x', 'y', 'z'].forEach(a => {
                    c.position[a] = Math.round(c.position[a] / 1.05) * 1.05;
                    c.rotation[a] = Math.round(c.rotation[a] / (Math.PI / 2)) * (Math.PI / 2);
                });
            });
            cubeGroup.remove(pivot);
            isAnimating = false;
        }
    });
}

canvas.addEventListener('mousedown', (e) => {
    if (isAnimating) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cubeGroup.children);
    if (hits.length > 0) { isDraggingSlice = true; startCubelet = hits[0].object; startMousePos.set(e.clientX, e.clientY); }
    else { isRotatingView = true; lastMousePos = { x: e.clientX, y: e.clientY }; }
});

document.addEventListener('mousemove', (e) => {
    if (isRotatingView) {
        cubeGroup.rotation.y += (e.clientX - lastMousePos.x) * 0.01;
        cubeGroup.rotation.x += (e.clientY - lastMousePos.y) * 0.01;
        lastMousePos = { x: e.clientX, y: e.clientY };
    }
});

document.addEventListener('mouseup', (e) => {
    if (isDraggingSlice && startCubelet) {
        const dx = e.clientX - startMousePos.x, dy = e.clientY - startMousePos.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) {
            if (Math.abs(dx) > Math.abs(dy)) {
                moveQueue.push({ axis: 'y', layer: startCubelet.position.y, dir: dx > 0 ? 1 : -1, type: 'manual' });
            } else {
                moveQueue.push({ axis: 'x', layer: startCubelet.position.x, dir: dy > 0 ? 1 : -1, type: 'manual' });
            }
        }
    }
    isRotatingView = isDraggingSlice = false;
});

const scramble = () => {
    if (isAnimating || moveQueue.length > 0) return;
    for (let i = 0; i < 60; i++) {
        const move = moveMap[Object.keys(moveMap)[Math.floor(Math.random() * 6)]];
        moveQueue.push({ ...move, dir: move.dir * (Math.random() > 0.5 ? 1 : -1), type: 'manual' });
    }
    historyStack = []; redoStack = [];
};

const undo = () => historyStack.length > 0 && moveQueue.push({ ...historyStack.pop(), type: 'undo' });
const redo = () => redoStack.length > 0 && moveQueue.push({ ...redoStack.pop(), type: 'redo' });

document.getElementById('scramble-btn').onclick = scramble;
document.getElementById('undo-btn').onclick = undo;
document.getElementById('redo-btn').onclick = redo;

window.addEventListener('keydown', (e) => {
    const k = e.key.toUpperCase();
    if (moveMap[k]) moveQueue.push({ ...moveMap[k], dir: moveMap[k].dir * (e.shiftKey ? -1 : 1), type: 'manual' });
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

function animate() {
    requestAnimationFrame(animate);
    if (moveQueue.length > 0 && !isAnimating) {
        const m = moveQueue.shift();
        if (m.type === 'manual') { redoStack = []; historyStack.push({ ...m, dir: -m.dir }); }
        else if (m.type === 'undo') redoStack.push({ ...m, dir: -m.dir });
        else if (m.type === 'redo') historyStack.push({ ...m, dir: -m.dir });
        rotateSlice(m);
    }
    renderer.render(scene, camera);
}
animate();

const modal = document.getElementById("controls-modal");
document.getElementById("open-menu").onclick = () => modal.style.display = "block";
document.querySelector(".close-btn").onclick = () => modal.style.display = "none";
window.onclick = (e) => e.target == modal && (modal.style.display = "none");

document.getElementById('size-slider').oninput = (e) => cubeGroup.scale.setScalar(e.target.value / 200);
window.onresize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
};

// --- UPDATED BACKGROUND CYCLER ---
const backgroundImages = [
      'darkgrey-pattern.webp',
      'lightgrey-pattern.webp',
      'white-pattern.webp',
      'purple-pattern.webp',
      'green-pattern.webp',
      'orange-pattern.webp'
];

let currentBgIndex = 0;

document.getElementById('bg-switch-btn').onclick = () => {
    currentBgIndex = (currentBgIndex + 1) % backgroundImages.length;
    
    // Target the <html> element
    const root = document.documentElement;
    
    // Update the image
    root.style.backgroundImage = `url('${backgroundImages[currentBgIndex]}')`;
    
    // Ensure the sizing doesn't break during the switch
    root.style.backgroundSize = "cover";
    root.style.backgroundRepeat = "no-repeat";
    root.style.backgroundPosition = "center";
};
