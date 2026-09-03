import { render } from "solid-js/web";
import "@fontsource-variable/geist";
import { App } from "./App";
import "./styles.css";
import { applyThemePreference, themePreference } from "./preferences";

applyThemePreference(themePreference());

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Missing root element.");
}

render(() => <App />, root);
