import styles from "./Hero.module.css";

const padIndexes = Array.from({ length: 16 }, (_, index) => index);

export function HeroPadField() {
  return (
    <div className={styles.padField} aria-hidden="true">
      <div className={styles.padGrid}>
        {padIndexes.map((index) => <span className={styles.ambientPad} key={index} />)}
      </div>
    </div>
  );
}
