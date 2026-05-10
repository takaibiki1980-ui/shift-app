import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";

const LOGO_CHARS = [
  { char: "し", color: "#F4847E" },
  { char: "ふ", color: "#7BC8C0" },
  { char: "ぽ", color: "#F5C355" },
  { char: "ん", color: "#A48FD0" },
];
