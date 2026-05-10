import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";

const LOGO_CHARS = [
  { char: "し", color: "#F4847E" },
  { char: "ふ", color: "#7BC8C0" },
  { char: "ぽ", color: "#F5C355" },
  { char: "ん", color: "#A48FD0" },
];
const LOGO_STYLE = {
  fontFamily: "'M PLUS Rounded 1c', sans-serif",
  fontWeight: 900,
  textShadow: "-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 2px 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, -2px 0 0 #fff",
  letterSpacing: "0.05em",
  lineHeight: 1,
};
function ShifuponLogo({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: size * 0.6, marginBottom: size * 0.3 }}>✦</span>
      {LOGO_CHARS.map(({ char, color }) => (
        <span key={char} style={{ ...LOGO_STYLE, fontSize: size, color }}>{char}</span>
      ))}
      <span style={{ fontSize: size * 0.5, marginBottom: -size * 0.1, color: "#F4A7B9" }}>✦</span>
    </span>
  );
}

function ShifuponIcon({ size = 48, radius = 12 }) {
  const rx = Math.round((radius / size) * 100);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sp-body" cx="38%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="60%" stopColor="#f8f4f0"/>
          <stop offset="100%" stopColor="#d5edec"/>
        </radialGradient>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F9D4C8"/>
          <stop offset="50%" stopColor="#C9EAE7"/>
          <stop offset="100%" stopColor="#D4C5F0"/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx={rx} fill="url(#sp-bg)"/>
      <ellipse cx="20" cy="64" rx="11" ry="15" fill="url(#sp-body)" transform="rotate(-22 20 64)"/>
      <ellipse cx="80" cy="64" rx="11" ry="15" fill="url(#sp-body)" transform="rotate(22 80 64)"/>
      <ellipse cx="50" cy="50" rx="30" ry="33" fill="url(#sp-body)"/>
      <ellipse cx="38" cy="83" rx="12" ry="8" fill="url(#sp-body)"/>
      <ellipse cx="62" cy="83" rx="12" ry="8" fill="url(#sp-body)"/>
      <ellipse cx="33" cy="55" rx="8" ry="5.5" fill="#F4A0A0" fillOpacity="0.38"/>
      <ellipse cx="67" cy="55" rx="8" ry="5.5" fill="#F4A0A0" fillOpacity="0.38"/>
      <circle cx="41" cy="44" r="3.8" fill="#1a1a1a"/>
      <circle cx="59" cy="44" r="3.8" fill="#1a1a1a"/>
      <path d="M 43 54 Q 50 62 57 54" stroke="#1a1a1a" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <rect x="35" y="60" width="30" height="23" rx="3.5" fill="white" fillOpacity="0.92" stroke="#ddd4cc" strokeWidth="0.8"/>
      <rect x="35" y="60" width="30" height="5.5" rx="3.5" fill="#ede5da" fillOpacity="0.9"/>
      <rect x="35" y="64" width="30" height="1.5" fill="#ede5da" fillOpacity="0.9"/>
      <line x1="45" y1="65.5" x2="45" y2="83" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="55" y1="65.5" x2="55" y2="83" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="35" y1="71" x2="65" y2="71" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="35" y1="77" x2="65" y2="77" stroke="#ddd4cc" strokeWidth="0.7"/>
      <path d="M 48 69.5 L 51.5 73.5 L 59 66" stroke="#7BC8C0" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const HELLO = 1; // placeholder - reading full content from file
