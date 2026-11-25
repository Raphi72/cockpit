import { domAnimation } from 'motion/react';

/**
 * Le moteur d'animation de Motion. Ce fichier est importé à la demande (voir MotionProvider) : il
 * forme un morceau à part, chargé après le premier rendu, et ne pèse donc pas sur le démarrage.
 */
export default domAnimation;
