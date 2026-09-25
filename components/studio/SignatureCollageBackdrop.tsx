import React from 'react';

/**
 * SignatureCollageBackdrop
 * Renders an artistic luxury collage watermark pattern of the RGodbeat signature
 * in assorted sizes (mini, small, medium, large) and subtle rotations across the
 * editing workspace background.
 */
export const SignatureCollageBackdrop: React.FC = () => {
  // Pre-calculated collage items for a non-random, rock-solid deterministic layout
  const collageItems = [
    { top: '3%', left: '4%', width: '75px', rotate: '-8deg', opacity: 0.05 },
    { top: '5%', left: '26%', width: '130px', rotate: '5deg', opacity: 0.04 },
    { top: '2%', left: '52%', width: '45px', rotate: '-12deg', opacity: 0.06 },
    { top: '6%', left: '74%', width: '100px', rotate: '8deg', opacity: 0.05 },
    { top: '4%', left: '91%', width: '55px', rotate: '-5deg', opacity: 0.04 },

    { top: '15%', left: '10%', width: '110px', rotate: '6deg', opacity: 0.045 },
    { top: '18%', left: '38%', width: '40px', rotate: '-10deg', opacity: 0.06 },
    { top: '14%', left: '62%', width: '140px', rotate: '-4deg', opacity: 0.04 },
    { top: '19%', left: '85%', width: '65px', rotate: '12deg', opacity: 0.05 },

    { top: '28%', left: '2%', width: '50px', rotate: '10deg', opacity: 0.055 },
    { top: '30%', left: '22%', width: '95px', rotate: '-7deg', opacity: 0.045 },
    { top: '26%', left: '48%', width: '160px', rotate: '4deg', opacity: 0.035 },
    { top: '31%', left: '72%', width: '50px', rotate: '-14deg', opacity: 0.06 },
    { top: '27%', left: '90%', width: '115px', rotate: '6deg', opacity: 0.04 },

    { top: '42%', left: '8%', width: '125px', rotate: '-6deg', opacity: 0.04 },
    { top: '44%', left: '34%', width: '48px', rotate: '9deg', opacity: 0.06 },
    { top: '40%', left: '58%', width: '90px', rotate: '-11deg', opacity: 0.05 },
    { top: '45%', left: '82%', width: '135px', rotate: '5deg', opacity: 0.04 },

    { top: '56%', left: '3%', width: '60px', rotate: '-9deg', opacity: 0.05 },
    { top: '58%', left: '24%', width: '145px', rotate: '7deg', opacity: 0.035 },
    { top: '54%', left: '50%', width: '42px', rotate: '-15deg', opacity: 0.065 },
    { top: '59%', left: '70%', width: '105px', rotate: '4deg', opacity: 0.045 },
    { top: '55%', left: '92%', width: '70px', rotate: '-8deg', opacity: 0.05 },

    { top: '70%', left: '12%', width: '90px', rotate: '8deg', opacity: 0.045 },
    { top: '72%', left: '36%', width: '150px', rotate: '-5deg', opacity: 0.035 },
    { top: '68%', left: '64%', width: '52px', rotate: '11deg', opacity: 0.06 },
    { top: '73%', left: '84%', width: '95px', rotate: '-9deg', opacity: 0.045 },

    { top: '84%', left: '5%', width: '130px', rotate: '-4deg', opacity: 0.04 },
    { top: '86%', left: '28%', width: '45px', rotate: '12deg', opacity: 0.06 },
    { top: '82%', left: '54%', width: '110px', rotate: '-7deg', opacity: 0.045 },
    { top: '87%', left: '76%', width: '58px', rotate: '8deg', opacity: 0.055 },
    { top: '85%', left: '93%', width: '120px', rotate: '-10deg', opacity: 0.04 },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
    >
      {/* Ambient gradient lighting to give depth to the collage */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/[0.04] via-transparent to-black/60" />

      {/* Scattered RGodbeat signature elements */}
      {collageItems.map((item, idx) => (
        <img
          key={`signature-collage-${idx}`}
          src="/images/rgodbeat-logo.png"
          alt=""
          loading="lazy"
          className="absolute object-contain filter brightness-150 drop-shadow-[0_0_12px_rgba(251,191,36,0.15)] transition-opacity"
          style={{
            top: item.top,
            left: item.left,
            width: item.width,
            transform: `rotate(${item.rotate})`,
            opacity: item.opacity,
          }}
        />
      ))}
    </div>
  );
};
