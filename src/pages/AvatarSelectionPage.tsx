import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ArrowRight, ChevronLeft } from "lucide-react";
import "../styles/avatar-selection.css";

interface AvatarSelectionPageProps {
  onBack: () => void;
  onNext: (selectedAvatar: string, role: string) => void;
}

const avatarsData = [
  {
    fileName: "Utilisatrice.png",
    roleName: "Utilisatrice",
    description: "Découvre les artistes, les talents et les profils musicaux autour de toi."
  },
  {
    fileName: "Utilisateur.png",
    roleName: "Utilisateur",
    description: "Découvre les artistes, les talents et les profils musicaux autour de toi."
  },
  {
    fileName: "Chanteuse, rappeuse.png",
    roleName: "Chanteuse, rappeuse",
    description: "Interprète, chante, rappe ou pose sa voix sur des projets musicaux."
  },
  {
    fileName: "Chanteur, rappeur..png",
    roleName: "Chanteur, rappeur",
    description: "Interprète, chante, rappe ou pose sa voix sur des projets musicaux."
  },
  {
    fileName: "danseuse.png",
    roleName: "Danseuse",
    description: "Danse, performe, crée des chorégraphies et accompagne les projets visuels."
  },
  {
    fileName: "danseurs.png",
    roleName: "Danseur",
    description: "Danse, performe, crée des chorégraphies et accompagne les projets visuels."
  },
  {
    fileName: "Beatmaker.png",
    roleName: "Beatmaker",
    description: "Crée des prods, des instrus, des rythmes et des ambiances musicales."
  },
  {
    fileName: "DJ.png",
    roleName: "DJ",
    description: "Mixe, anime, enchaîne les sons et fait vivre l’énergie musicale en live."
  },
  {
    fileName: "Beatboxer.png",
    roleName: "Beatboxer",
    description: "Crée des rythmes, sons et performances vocales avec la bouche."
  },
  {
    fileName: "Guitariste acoustique.png",
    roleName: "Guitariste acoustique",
    description: "Joue de la guitare acoustique pour accompagner, composer ou performer."
  },
  {
    fileName: "Guitariste électrique..png",
    roleName: "Guitariste électrique",
    description: "Apporte riffs, solos, énergie et texture électrique aux morceaux."
  },
  {
    fileName: "Pianiste..png",
    roleName: "Pianiste",
    description: "Joue du piano ou du clavier pour composer, accompagner ou performer."
  },
  {
    fileName: "batteurs, batteuses.png",
    roleName: "Batteur, batteuse",
    description: "Apporte le rythme, la puissance et l’énergie live avec la batterie."
  },
  {
    fileName: "Bassiste.png",
    roleName: "Bassiste",
    description: "Pose les lignes de basse, le groove et les fondations rythmiques du morceau."
  },
  {
    fileName: "Violoniste.png",
    roleName: "Violoniste",
    description: "Apporte mélodie, émotion et couleur avec le violon."
  },
  {
    fileName: "accordéoniste.png",
    roleName: "Accordéoniste",
    description: "Joue de l’accordéon pour apporter une couleur musicale forte et identifiable."
  },
  {
    fileName: "Instrumentiste à cordes V2.png",
    roleName: "Instrumentiste à cordes",
    description: "Joue d'un instrument à cordes comme la harpe, le violoncelle ou la contrebasse."
  },
  {
    fileName: "Instruments a vent.png",
    roleName: "Instrumentiste à vent",
    description: "Joue d’un instrument à vent comme la flûte, la clarinette ou le saxophone."
  },
  {
    fileName: "Instrumentiste à cuivre..png",
    roleName: "Instrumentiste à cuivre",
    description: "Joue d’un cuivre comme la trompette, le trombone, le tuba ou le cor."
  },
  {
    fileName: "percussionniste.png",
    roleName: "Percussionniste",
    description: "Ajoute du rythme, des textures et des percussions live aux projets musicaux."
  },
  {
    fileName: "Auteur parolier.png",
    roleName: "Auteur, parolier",
    description: "Écrit des paroles, des refrains, des textes et donne un sens aux mélodies."
  },
  {
    fileName: "Compositeur.png",
    roleName: "Compositeur",
    description: "Crée des mélodies, des harmonies et des idées musicales originales."
  },
  {
    fileName: "Producteur musicalv2.png",
    roleName: "Producteur",
    description: "Accompagne, finance et orchestre la création artistique et le développement des projets."
  },
  {
    fileName: "Sound designer.png",
    roleName: "Sound designer",
    description: "Crée des sons, ambiances, effets audio et textures sonores originales."
  },
  {
    fileName: "Ingénieur du son.png",
    roleName: "Ingénieur du son",
    description: "Enregistre, mixe, corrige et améliore la qualité sonore des projets."
  },
  {
    fileName: "Coatch vocal.png",
    roleName: "Coach vocal",
    description: "Aide à travailler la voix, la justesse, la respiration et la performance vocale."
  },
  {
    fileName: "Direction artistique V2.png",
    roleName: "Direction artistique",
    description: "Guide l’univers, l’image, le son et la cohérence globale d’un projet."
  },
  {
    fileName: "Ménagement.png",
    roleName: "Management",
    description: "Gère les affaires des artistes, les contrats, les plannings et les opportunités."
  },
  {
    fileName: "Label.png",
    roleName: "Label",
    description: "Accompagne, développe, produit ou distribue des artistes et leurs projets."
  },
  {
    fileName: "vidéaste clipper.png",
    roleName: "Vidéaste clipper",
    description: "Réalise des clips, vidéos, contenus visuels et images pour les artistes."
  },
  {
    fileName: "Studio d'enregistrement.png",
    roleName: "Studio",
    description: "Propose un lieu, du matériel et un cadre professionnel pour enregistrer."
  },
  {
    fileName: "Organisation Scénique.png",
    roleName: "Organisation scénique",
    description: "Conçoit la mise en scène, la scénographie et la technique pour les performances live."
  }
];

export default function AvatarSelectionPage({ onBack: _onBack, onNext }: AvatarSelectionPageProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [avatarPedestalScale, setAvatarPedestalScale] = useState(1);

  // Dragging state references
  const isDragging = useRef(false);
  const startX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);

  // Sync animation variables using refs to prevent stale closure capturing inside rAF loop
  const targetProgressRef = useRef(0);
  const scrollProgressRef = useRef(0);

  // High-End Barrel physics tracking references
  const isSpinning = useRef(false);
  const spinVelocity = useRef(0);
  const activeIndexRef = useRef(0);
  const roleDropdownRef = useRef<HTMLDivElement | null>(null);
  const avatarPedestalScaleCache = useRef<Map<string, number>>(new Map());

  // Synchronize state with animation refs instantly
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Force scroll-to-top on mount to prevent browser scroll retention/clipping
  useEffect(() => {
    window.scrollTo(0, 0);
    if (document.body) {
      document.body.scrollTop = 0;
    }
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!roleDropdownRef.current?.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRoleDropdownOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const activeAvatar = avatarsData[activeIndex];

  useEffect(() => {
    const cacheKey = activeAvatar.fileName;
    const cachedScale = avatarPedestalScaleCache.current.get(cacheKey);
    if (cachedScale) {
      setAvatarPedestalScale(cachedScale);
      return;
    }

    let isCancelled = false;
    const image = new Image();

    image.onload = () => {
      if (isCancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        setAvatarPedestalScale(1);
        return;
      }

      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width;
      let maxX = -1;
      let minY = canvas.height;
      let maxY = -1;

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha > 16) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        setAvatarPedestalScale(1);
        return;
      }

      const visibleWidth = maxX - minX + 1;
      const visibleHeight = maxY - minY + 1;
      const visibleRatio = visibleWidth / visibleHeight;
      const scale = Math.max(0.82, Math.min(1.2, 0.52 + visibleRatio * 0.6));

      avatarPedestalScaleCache.current.set(cacheKey, scale);
      setAvatarPedestalScale(scale);
    };

    image.onerror = () => {
      if (!isCancelled) {
        setAvatarPedestalScale(1);
      }
    };

    image.src = `/images/V4/${activeAvatar.fileName}`;

    return () => {
      isCancelled = true;
    };
  }, [activeAvatar.fileName]);

  // Calculate baseSpacingX dynamically based on window width
  let baseSpacingX = 280;
  if (windowWidth < 1200) {
    baseSpacingX = 240;
  }
  if (windowWidth < 991) {
    baseSpacingX = 180;
  }
  if (windowWidth < 480) {
    baseSpacingX = 130;
  }

  // Calculate real-time targeted progress (fractional index)
  const targetProgress = activeIndex - (dragOffset / baseSpacingX);

  useEffect(() => {
    targetProgressRef.current = targetProgress;
  }, [targetProgress]);

  // Premium requestAnimationFrame physics (friction coasting & magnetic snapping) for high-end buttery feel
  useEffect(() => {
    let animationFrameId: number;

    const updateInterpolation = () => {
      if (isDragging.current) {
        // While actively dragging, follow finger with a tight fluid lag (0.25 lerp speed)
        const target = targetProgressRef.current;
        const diff = target - scrollProgressRef.current;
        scrollProgressRef.current += diff * 0.25;
        setScrollProgress(scrollProgressRef.current);
      } else if (isSpinning.current) {
        // Inertial coasting physics (Like a revolvers barrel / cylinder wheel!)
        scrollProgressRef.current += spinVelocity.current;
        
        // Natural air friction deceleration
        spinVelocity.current *= 0.955;

        // Bouncing/Locking limits at track edges to prevent out of bounds
        if (scrollProgressRef.current < 0) {
          scrollProgressRef.current = 0;
          spinVelocity.current = 0;
          isSpinning.current = false;
        } else if (scrollProgressRef.current > avatarsData.length - 1) {
          scrollProgressRef.current = avatarsData.length - 1;
          spinVelocity.current = 0;
          isSpinning.current = false;
        }

        setScrollProgress(scrollProgressRef.current);

        // Crucial performance optimization: Only update React state when crossing item candidate boundaries
        const currentRounded = Math.round(scrollProgressRef.current);
        const boundedIndex = Math.max(0, Math.min(avatarsData.length - 1, currentRounded));
        if (boundedIndex !== activeIndexRef.current) {
          activeIndexRef.current = boundedIndex;
          setActiveIndex(boundedIndex);
        }

        // Snapping trigger when speed drops below critical threshold
        if (Math.abs(spinVelocity.current) < 0.005) {
          isSpinning.current = false;
          spinVelocity.current = 0;
          targetProgressRef.current = boundedIndex;
        }
      } else {
        // Magnetic snap alignment to the current candidate index
        const diff = targetProgressRef.current - scrollProgressRef.current;
        if (Math.abs(diff) > 0.0001) {
          scrollProgressRef.current += diff * 0.12;
          setScrollProgress(scrollProgressRef.current);
        } else if (scrollProgressRef.current !== targetProgressRef.current) {
          scrollProgressRef.current = targetProgressRef.current;
          setScrollProgress(targetProgressRef.current);
        }
      }
      animationFrameId = requestAnimationFrame(updateInterpolation);
    };

    animationFrameId = requestAnimationFrame(updateInterpolation);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Bidirectional sync: dropdown changes center avatar
  const selectRoleIndex = (selectedIndex: number) => {
    setActiveIndex(selectedIndex);
    targetProgressRef.current = selectedIndex;
    scrollProgressRef.current = selectedIndex;
    setScrollProgress(selectedIndex);
    setIsRoleDropdownOpen(false);
  };

  /*
  const handlePrev = () => {
    const nextVal = Math.max(0, activeIndex - 1);
    setActiveIndex(nextVal);
    targetProgressRef.current = nextVal;
  };

  const handleNext = () => {
    const nextVal = Math.min(avatarsData.length - 1, activeIndex + 1);
    setActiveIndex(nextVal);
    targetProgressRef.current = nextVal;
  };
  */

  // Drag / Swipe handling with velocity tracking
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    isSpinning.current = false;
    spinVelocity.current = 0;
    setIsDraggingState(true);
    startX.current = e.clientX;
    lastX.current = e.clientX;
    lastTime.current = performance.now();
    velocity.current = 0;
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const currentX = e.clientX;
    const currentTime = performance.now();
    const dt = currentTime - lastTime.current;
    if (dt > 0) {
      velocity.current = (currentX - lastX.current) / dt;
    }
    lastX.current = currentX;
    lastTime.current = currentTime;
    setDragOffset(currentX - startX.current);
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);

    const currentTime = performance.now();
    const timeSinceLastMove = currentTime - lastTime.current;
    
    let speed = velocity.current; // Pixels per ms
    if (timeSinceLastMove > 100) {
      speed = 0;
    }

    // Balanced premium sensitivity multiplier (1.15) to feel incredibly smooth, low-resistance, but perfectly controlled when throwing!
    let initialVelocity = 0;
    if (Math.abs(speed) > 0.05) {
      initialVelocity = -speed * 16.6 / baseSpacingX * 1.15;
    }

    if (Math.abs(initialVelocity) > 0.005) {
      isSpinning.current = true;
      spinVelocity.current = initialVelocity;
    } else {
      isSpinning.current = false;
      spinVelocity.current = 0;

      const currentScrollVal = scrollProgressRef.current;
      const snapIndex = Math.round(currentScrollVal);
      const boundedIndex = Math.max(0, Math.min(avatarsData.length - 1, snapIndex));
      
      setActiveIndex(boundedIndex);
      setDragOffset(0);
      targetProgressRef.current = boundedIndex;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    isSpinning.current = false;
    spinVelocity.current = 0;
    setIsDraggingState(true);
    startX.current = e.touches[0].clientX;
    lastX.current = e.touches[0].clientX;
    lastTime.current = performance.now();
    velocity.current = 0;
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const currentX = e.touches[0].clientX;
    const currentTime = performance.now();
    const dt = currentTime - lastTime.current;
    if (dt > 0) {
      velocity.current = (currentX - lastX.current) / dt;
    }
    lastX.current = currentX;
    lastTime.current = currentTime;
    setDragOffset(currentX - startX.current);
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  const handleAvatarClick = (index: number, fractionalOffset: number) => {
    if (Math.abs(fractionalOffset) < 0.1) return;
    setActiveIndex(index);
  };

  const handleNextStep = () => {
    onNext(activeAvatar.fileName, activeAvatar.roleName);
  };

  // Render wide window of 13 avatars dynamically sliding with scrollProgress
  const getVisibleAvatars = () => {
    const list = [];
    const centerIndex = Math.round(scrollProgress);
    for (let offset = -6; offset <= 6; offset++) {
      const index = centerIndex + offset;
      if (index >= 0 && index < avatarsData.length) {
        list.push({
          avatar: avatarsData[index],
          index,
          offset
        });
      }
    }
    return list;
  };

  // Active Pedestal reacts only when fully snapped/resting
  const isResting = !isDraggingState && Math.abs(scrollProgress - activeIndex) < 0.02;

  return (
    <div className="avatar-selection-view">
      {/* 
        Center 3D Curved Perspective Scene:
        Acts as the background backdrop and can span 100% of the screen width.
      */}
      <section 
        className="avatar-3d-scene" 
        aria-label="Carousel d'avatars 3D"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Active Avatar Glowing Pedestal on floor - reactive CSS transitions */}
        <div 
          className={`pedestal-glow ${isResting ? "active" : ""} ${isDraggingState ? "interacting" : ""}`} 
          style={{ "--avatar-pedestal-scale": avatarPedestalScale } as React.CSSProperties}
        />

        {/* Track Container holding avatars list positioned dynamically */}
        <div className={`avatar-track-container ${isDraggingState ? "dragging" : ""}`}>
          {getVisibleAvatars().map(({ avatar, index }) => {
            const itemFractionalOffset = index - scrollProgress;
            // Highly premium spaced out formula to accommodate larger avatars without overlap!
            const getSymmetricX = (x: number): number => {
              const abs = Math.abs(x);
              const coef = 1950 * (baseSpacingX / 280);
              return Math.sign(x) * coef * (1 - Math.pow(0.78, abs));
            };
            const translateX = getSymmetricX(itemFractionalOffset);
            const verticalScale = baseSpacingX / 280;
            
            // Precision symmetric Y alignment (extremely wide, gentle circular dome track)
            const getSymmetricY = (x: number): number => {
              const abs = Math.abs(x);
              if (abs <= 1.0) {
                // Transition from 0 to 4.5
                return 0 + (4.5 - 0) * abs;
              }
              if (abs <= 2.0) {
                const t = abs - 1.0;
                // Transition from 4.5 to 10.0
                return 4.5 + (10.0 - 4.5) * t;
              }
              if (abs <= 3.0) {
                const t = abs - 2.0;
                // Transition from 10.0 to 16.0
                return 10.0 + (16.0 - 10.0) * t;
              }
              if (abs <= 4.0) {
                const t = abs - 3.0;
                // Transition from 16.0 to 23.0
                return 16.0 + (23.0 - 16.0) * t;
              }
              if (abs <= 5.0) {
                const t = abs - 4.0;
                // Transition from 23.0 to 31.0
                return 23.0 + (31.0 - 23.0) * t;
              }
              if (abs <= 6.0) {
                const t = abs - 5.0;
                // Transition from 31.0 to 40.0
                return 31.0 + (40.0 - 31.0) * t;
              }
              return 40.0;
            };
            
            // EXACT SMOOTH SYMMETRIC SCALE RULE matching the user's explicit level specifications, scaled by 220%!
            const getScale = (x: number): number => {
              const abs = Math.abs(x);
              let baseScale = 0.25;
              if (abs <= 1.0) {
                // Interpolate from 1.40 (selected) to 0.78 (neighbors)
                baseScale = 1.40 + (0.78 - 1.40) * abs;
              } else if (abs <= 2.0) {
                const t = abs - 1.0;
                // Interpolate from 0.78 to 0.58 (2nd level)
                baseScale = 0.78 + (0.58 - 0.78) * t;
              } else if (abs <= 3.0) {
                const t = abs - 2.0;
                // Interpolate from 0.58 to 0.42 (3rd level)
                baseScale = 0.58 + (0.42 - 0.58) * t;
              } else if (abs <= 4.0) {
                const t = abs - 3.0;
                // Interpolate from 0.42 to 0.30 (4th level / very far)
                baseScale = 0.42 + (0.30 - 0.42) * t;
              } else if (abs <= 5.0) {
                const t = abs - 4.0;
                // Interpolate from 0.30 to 0.20 (5th level)
                baseScale = 0.30 + (0.20 - 0.30) * t;
              } else if (abs <= 6.0) {
                const t = abs - 5.0;
                // Interpolate from 0.20 to 0.12 (outermost boundary)
                baseScale = 0.20 + (0.12 - 0.20) * t;
              }
              return baseScale * 1.76; // Reduced the scale multiplier to 1.76 (exactly 80% of 2.2) to make the carousel elegantly compact
            };
            const scale = getScale(itemFractionalOffset);
            
            // EXACT SMOOTH SYMMETRIC OPACITY RULE matching user request:
            // Selected and the two nearest neighbors on each side stay opaque.
            const getOpacity = (x: number): number => {
              const abs = Math.abs(x);
              if (abs <= 1.0) {
                // Keep the three central avatars fully opaque.
                return 1;
              }
              if (abs <= 2.0) {
                // Keep the second neighbor fully opaque as well.
                return 1;
              }
              if (abs <= 3.0) {
                const t = abs - 2.0;
                // Start fading beyond the two fully opaque neighbors.
                return 1 + (0.18 - 1) * t;
              }
              if (abs <= 4.0) {
                const t = abs - 3.0;
                // Interpolate from 0.18 to 0.10 (4th level)
                return 0.18 + (0.10 - 0.18) * t;
              }
              if (abs <= 5.0) {
                const t = abs - 4.0;
                // Interpolate from 0.10 to 0.04 (5th level)
                return 0.10 + (0.04 - 0.10) * t;
              }
              if (abs <= 6.0) {
                const t = abs - 5.0;
                // Smoothly fade to 0.0 at the rendering limits
                return 0.04 * (1 - t);
              }
              return 0.0;
            };
            const opacity = getOpacity(itemFractionalOffset);

            // EXACT PREMIUM DEPTH-OF-FIELD BLUR EFFECT (Vers le dixième avatar, tu commences le Blur)
            const getBlur = (x: number): number => {
              const abs = Math.abs(x);
              if (abs <= 3.5) {
                return 0; // Neighbors and close levels remain perfectly sharp
              }
              if (abs <= 5.0) {
                const t = (abs - 3.5) / 1.5;
                // Interpolate from 0px to 2px blur
                return 0 + (2 - 0) * t;
              }
              if (abs <= 6.0) {
                const t = abs - 5.0;
                // Interpolate from 2px to 4px blur (ghostly effect)
                return 2 + (4 - 2) * t;
              }
              return 4; // Caps at 4px blur for the most distant avatars
            };
            const blurVal = getBlur(itemFractionalOffset);
            const absOffset = Math.abs(itemFractionalOffset);
            const zIndex = Math.round(30 - absOffset * 5);
            
            // Lower only avatars that need an individual vertical correction as they approach x = 0.
            const activeCenterLift = 20;
            const centerLift = activeCenterLift * Math.max(0, 1 - Math.abs(itemFractionalOffset));
            const activeCenterDropByRole: Record<string, number> = {
              "Instrumentiste à cordes": 30,
              "Direction artistique": 20,
            };
            const activeCenterDrop = 40 + (activeCenterDropByRole[avatar.roleName] ?? 0);
            const centerDrop = activeCenterDrop * Math.max(0, 1 - Math.abs(itemFractionalOffset));
            
            // All avatars are aligned consistently on the exact same vertical track line
            const indexYOffset = 15;

            const translateY = (getSymmetricY(itemFractionalOffset) + indexYOffset - centerLift) * verticalScale + centerDrop;
            
            const style: React.CSSProperties = {
              transform: `translate3d(calc(-50% + ${translateX}px), ${translateY}px, 0) scale(${scale})`,
              opacity: Math.max(0, opacity),
              zIndex: zIndex,
              filter: blurVal > 0 ? `blur(${blurVal}px)` : undefined,
            };

            return (
              <div 
                key={avatar.roleName} 
                className={`avatar-item ${Math.abs(itemFractionalOffset) < 0.1 ? "active" : ""}`}
                style={style}
                onClick={() => handleAvatarClick(index, itemFractionalOffset)}
              >
                <div className="avatar-img-container">
                  <img 
                    src={`/images/V4/${avatar.fileName}`} 
                    className="avatar-portrait" 
                    alt={avatar.roleName} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 
        Central UI Container:
        Strictly limits all controls, texts, dropdown, banners, and buttons
        within a centered 1440px wide boundary, perfect for ultra-wide monitors.
      */}
      <div className="avatar-ui-container">
        {/* Main top text and dropdown block */}
        <div className="avatar-main-layout">
          {/* Left Column Info Block */}
          <section className="avatar-left-info" aria-label="Explication étape 1">
            <h2>Choisis ton avatar <span className="avatar-title-violet">globe</span></h2>
            <p className="subtitle-role">Il représentera ton rôle sur Meewav.</p>
            <button type="button" className="back-step-button" onClick={_onBack}>
              <ChevronLeft size={16} strokeWidth={2.5} className="back-arrow-icon" />
              RETOUR
            </button>
          </section>

          {/* Right Column layout: Role Box */}
          <section className="avatar-right-role-box" aria-label="Sélection du rôle">
            <span className="role-label-title">Rôle sur Meewav</span>
            
            <h3 className="avatar-role-heading">{activeAvatar.roleName}</h3>


            <p className="role-description-text">
              {activeAvatar.description}
            </p>
            <button type="button" className="next-step-button" onClick={handleNextStep}>
              SUIVANT
              <ArrowRight size={16} strokeWidth={2} className="next-arrow-icon" />
            </button>
          </section>
        </div>

        {/* Active Avatar Indicator Banner & Dots */}
        <div className={`active-avatar-index-banner ${isRoleDropdownOpen ? "is-open" : ""}`} ref={roleDropdownRef}>
          <button
            type="button"
            className="avatar-role-trigger"
            aria-haspopup="listbox"
            aria-expanded={isRoleDropdownOpen}
            aria-controls="avatar-role-options"
            aria-label={`Choisir le rôle : ${activeAvatar.roleName}, ${activeIndex + 1} sur ${avatarsData.length}`}
            onClick={() => setIsRoleDropdownOpen((isOpen) => !isOpen)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIsRoleDropdownOpen(true);
              }
            }}
          >
          <span className="active-avatar-name">
            {activeAvatar.roleName}
            <span className="active-avatar-index">{activeIndex + 1}/{avatarsData.length}</span>
            <ChevronDown className="avatar-role-chevron" size={17} aria-hidden="true" />
          </span>
          
          {/* Bullets scroll indicator */}
          <div className="carousel-bullets" aria-hidden="true">
            <span className="bullet-dot" />
            <span className={`bullet-dot ${activeIndex >= 0 && activeIndex < 6 ? "active" : ""}`} />
            <span className={`bullet-dot ${activeIndex >= 6 && activeIndex < 12 ? "active" : ""}`} />
            <span className={`bullet-dot ${activeIndex >= 12 && activeIndex < 18 ? "active" : ""}`} />
            <span className={`bullet-dot ${activeIndex >= 18 && activeIndex < 24 ? "active" : ""}`} />
            <span className={`bullet-dot ${activeIndex >= 24 && activeIndex < 32 ? "active" : ""}`} />
            <span className="bullet-dot" />
          </div>
          </button>
              {isRoleDropdownOpen && (
                <div id="avatar-role-options" className="role-dropdown-menu" role="listbox" aria-label="Rôle sur Meewav">
                  {avatarsData.map((item, index) => (
                    <button
                      type="button"
                      key={item.roleName}
                      className={`role-dropdown-option ${index === activeIndex ? "is-selected" : ""}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onClick={() => selectRoleIndex(index)}
                    >
                      {item.roleName}
                    </button>
                  ))}
                </div>
              )}
        </div>

      </div>
    </div>
  );
}
