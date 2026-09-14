'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHDAssetsEnabled, setHDAssetsEnabled } from '@/service/gamedb';

import { useAppDispatch, useAppSelector } from '@/morpheus-app/store/hooks';
import {
  closeGameMenu,
  openGameMenu,
  selectGameMenu,
  setShowDiscoveryDuringPlay,
  showGameMenuMain,
  showGameMenuSaveSlots,
} from '@/morpheus-app/store/slices/gameMenuSlice';
import styles from './game-menu.module.css';
import { CloudReportPanel } from '@/morpheus-app/cloud/CloudReportPanel';
import { CloudPlayerDetails } from '@/morpheus-app/cloud/CloudPlayerDetails';

type GameMenuProps = {
  saveSlots: ReactNode;
  onBeforeOpen: () => void;
  onReturnToTitle: () => void;
};

export const GameMenu = ({
  saveSlots,
  onBeforeOpen,
  onReturnToTitle,
}: GameMenuProps) => {
  const dispatch = useAppDispatch();
  const menu = useAppSelector(selectGameMenu);
  const [hdEnabled, setHDEnabled] = useState(false);
  const [hdError, setHDError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wheelButtonRef = useRef<HTMLButtonElement>(null);
  const backdropPressedRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setHDEnabled(getHDAssetsEnabled());
    try {
      dispatch(
        setShowDiscoveryDuringPlay(
          localStorage.getItem('morpheus.showDiscoveryDuringPlay') === 'true',
        ),
      );
    } catch (error) {
      console.warn('Discovery display preference could not be read.', error);
    }
  }, [dispatch]);

  const close = useCallback(() => {
    dispatch(closeGameMenu());
  }, [dispatch]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (menu.open && !dialog.open) {
      dialog.showModal();
      wasOpenRef.current = true;
      return;
    }
    if (!menu.open && dialog.open) {
      dialog.close();
    }
    if (!menu.open && wasOpenRef.current) {
      wasOpenRef.current = false;
      wheelButtonRef.current?.focus();
    }
  }, [menu.open]);

  const open = useCallback(() => {
    onBeforeOpen();
    dispatch(openGameMenu());
  }, [dispatch, onBeforeOpen]);

  const handleBackdropPointerDown = (
    event: PointerEvent<HTMLDialogElement>,
  ) => {
    event.stopPropagation();
    backdropPressedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropPointerUp = (event: PointerEvent<HTMLDialogElement>) => {
    event.stopPropagation();
    const closes =
      backdropPressedRef.current && event.target === event.currentTarget;
    backdropPressedRef.current = false;
    if (closes) close();
  };

  return (
    <>
      <button
        ref={wheelButtonRef}
        type="button"
        className={styles.wheelButton}
        aria-label="Open game menu"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        <img src="/image/icon/gear.png" alt="" />
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label="Game menu"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onClose={() => {
          if (menu.open) close();
        }}
        onPointerDown={handleBackdropPointerDown}
        onPointerUp={handleBackdropPointerUp}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`${styles.wheelButton} ${styles.dialogWheel}`}
          aria-label="Close game menu"
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          <img src="/image/icon/gear.png" alt="" />
        </button>

        <section
          className={styles.panel}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <CloudPlayerDetails
            onBeforeAccountOpen={() => {
              // Clerk's portal cannot receive input beneath a modal dialog.
              // Release the top layer before Clerk opens and owns focus.
              wasOpenRef.current = false;
              dialogRef.current?.close();
              close();
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={hdEnabled}
              onChange={(event) => {
                try {
                  setHDAssetsEnabled(event.target.checked);
                  setHDEnabled(event.target.checked);
                  setHDError(undefined);
                } catch {
                  setHDError('Could not save the HD preference. Allow browser storage and try again.');
                }
              }}
            />{' '}
            HD assets
          </label>
          <p>Uses enhanced images and videos where available; other assets stay original. Applies to newly loaded media.</p>
          {hdError && <p role="alert">{hdError}</p>}
          <label>
            <input
              type="checkbox"
              checked={menu.showDiscoveryDuringPlay}
              onChange={(event) => {
                const enabled = event.target.checked;
                dispatch(setShowDiscoveryDuringPlay(enabled));
                try {
                  localStorage.setItem(
                    'morpheus.showDiscoveryDuringPlay',
                    String(enabled),
                  );
                } catch (error) {
                  console.warn(
                    'Discovery display preference could not be saved.',
                    error,
                  );
                }
              }}
            />{' '}
            Show discovery during play
          </label>
          {menu.screen === 'main' ? (
            <nav className={styles.mainActions} aria-label="Game menu">
              <button type="button" onClick={close}>
                Resume Game
              </button>
              <button
                type="button"
                onClick={() => dispatch(showGameMenuSaveSlots())}
              >
                Save Slots
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  onReturnToTitle();
                }}
              >
                Return to Title
              </button>
            </nav>
          ) : (
            <div className={styles.saveSlots}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => dispatch(showGameMenuMain())}
              >
                Back
              </button>
              {saveSlots}
            </div>
          )}
          <CloudReportPanel />
        </section>
      </dialog>
    </>
  );
};
