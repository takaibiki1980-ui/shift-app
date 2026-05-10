import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";