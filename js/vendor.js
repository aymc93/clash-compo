// Façade Preact + htm (chargés via l'import map de index.html, aucune étape de build).
import { h, render, Fragment } from 'preact';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback };
