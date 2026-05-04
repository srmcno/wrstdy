import { SEAL } from '../lib/seal.js';
import { VER } from '../lib/constants.js';

export function Header() {
  return (
    <header className="hdr no-print">
      <img src={SEAL} alt="Choctaw Nation Great Seal" className="seal" />
      <div className="bn">
        <div className="bn-n">CHOCTAW NATION</div>
        <div className="bn-d">Office of Water Resource Management</div>
        <div className="bn-r" />
        <div className="bn-a">Water Rate Study Tool</div>
      </div>
      <div className="hdr-e">
        <div>FAITH ✦ FAMILY ✦ CULTURE</div>
        <div style={{ marginTop: 2 }}>v{VER}</div>
      </div>
    </header>
  );
}
