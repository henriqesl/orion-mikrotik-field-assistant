import LinkConfiguration from "../../shared/frontend/src/features/wireless/LinkConfiguration.jsx";
import "./radio.css";

export default function RadioLink(props) {
  return <LinkConfiguration {...props} guided />;
}
