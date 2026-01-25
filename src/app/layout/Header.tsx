import "../../styles/app.css";
import React from "react";
import logo from "../../assets/escape-logo.png";

type Props = {
  onOpenMenu: () => void;
};

export default function Header({ onOpenMenu }: Props) {
  return (
    <header className="header">
      <button className="iconBtn" onClick={onOpenMenu} aria-label="Abrir menú">
        <span className="burger">
          <i />
          <i />
          <i />
        </span>
      </button>

      <div className="headerCenter">
        <img className="headerLogo" src={logo} alt="Escape Games" />
      </div>

      <div className="statusPill">online</div>
    </header>
  );
}
