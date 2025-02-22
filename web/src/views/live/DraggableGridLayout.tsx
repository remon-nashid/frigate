import { usePersistence } from "@/hooks/use-persistence";
import {
  BirdseyeConfig,
  CameraConfig,
  FrigateConfig,
} from "@/types/frigateConfig";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Layout, Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { LivePlayerMode } from "@/types/live";
import { ASPECT_VERTICAL_LAYOUT, ASPECT_WIDE_LAYOUT } from "@/types/record";
import { Skeleton } from "@/components/ui/skeleton";
import { useResizeObserver } from "@/hooks/resize-observer";
import { isEqual } from "lodash";
import useSWR from "swr";
import { isDesktop, isMobile, isSafari } from "react-device-detect";
import BirdseyeLivePlayer from "@/components/player/BirdseyeLivePlayer";
import LivePlayer from "@/components/player/LivePlayer";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IoClose } from "react-icons/io5";
import { LuMove } from "react-icons/lu";
import { cn } from "@/lib/utils";

type DraggableGridLayoutProps = {
  cameras: CameraConfig[];
  cameraGroup: string;
  cameraRef: (node: HTMLElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  includeBirdseye: boolean;
  onSelectCamera: (camera: string) => void;
  windowVisible: boolean;
  visibleCameras: string[];
  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
};
export default function DraggableGridLayout({
  cameras,
  cameraGroup,
  containerRef,
  cameraRef,
  includeBirdseye,
  onSelectCamera,
  windowVisible,
  visibleCameras,
  isEditMode,
  setIsEditMode,
}: DraggableGridLayoutProps) {
  const { data: config } = useSWR<FrigateConfig>("config");
  const birdseyeConfig = useMemo(() => config?.birdseye, [config]);

  const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive), []);

  const [gridLayout, setGridLayout, isGridLayoutLoaded] = usePersistence<
    Layout[]
  >(`${cameraGroup}-draggable-layout`);

  const [currentCameras, setCurrentCameras] = useState<CameraConfig[]>();
  const [currentIncludeBirdseye, setCurrentIncludeBirdseye] =
    useState<boolean>();
  const [currentGridLayout, setCurrentGridLayout] = useState<
    Layout[] | undefined
  >();

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      if (!isGridLayoutLoaded || !isEqual(gridLayout, currentGridLayout)) {
        return;
      }
      // save layout to idb
      setGridLayout(currentLayout);
    },
    [setGridLayout, isGridLayoutLoaded, gridLayout, currentGridLayout],
  );

  const generateLayout = useCallback(() => {
    if (!isGridLayoutLoaded) {
      return;
    }

    const cameraNames =
      includeBirdseye && birdseyeConfig?.enabled
        ? ["birdseye", ...cameras.map((camera) => camera?.name || "")]
        : cameras.map((camera) => camera?.name || "");

    const optionsMap: Layout[] = currentGridLayout
      ? currentGridLayout.filter((layout) => cameraNames?.includes(layout.i))
      : [];

    cameraNames.forEach((cameraName, index) => {
      const existingLayout = optionsMap.find(
        (layout) => layout.i === cameraName,
      );

      // Skip if the camera already exists in the layout
      if (existingLayout) {
        return;
      }

      let aspectRatio;
      let col;

      // Handle "birdseye" camera as a special case
      if (cameraName === "birdseye") {
        aspectRatio =
          (birdseyeConfig?.width || 1) / (birdseyeConfig?.height || 1);
        col = 0; // Set birdseye camera in the first column
      } else {
        const camera = cameras.find((cam) => cam.name === cameraName);
        aspectRatio =
          (camera && camera?.detect.width / camera?.detect.height) || 16 / 9;
        col = index % 3; // Regular cameras distributed across columns
      }

      // Calculate layout options based on aspect ratio
      const columnsPerPlayer = 4;
      let height;
      let width;

      if (aspectRatio < 1) {
        // Portrait
        height = 2 * columnsPerPlayer;
        width = columnsPerPlayer;
      } else if (aspectRatio > 2) {
        // Wide
        height = 1 * columnsPerPlayer;
        width = 2 * columnsPerPlayer;
      } else {
        // Landscape
        height = 1 * columnsPerPlayer;
        width = columnsPerPlayer;
      }

      const options = {
        i: cameraName,
        x: col * width,
        y: 0, // don't set y, grid does automatically
        w: width,
        h: height,
        isDraggable: isEditMode,
        isResizable: isEditMode,
      };

      optionsMap.push(options);
    });

    return optionsMap;
  }, [
    cameras,
    isEditMode,
    isGridLayoutLoaded,
    currentGridLayout,
    includeBirdseye,
    birdseyeConfig,
  ]);

  useEffect(() => {
    if (currentGridLayout) {
      const updatedGridLayout = currentGridLayout.map((layout) => ({
        ...layout,
        isDraggable: isEditMode,
        isResizable: isEditMode,
      }));
      if (isEditMode) {
        setGridLayout(updatedGridLayout);
        setCurrentGridLayout(updatedGridLayout);
      } else {
        setGridLayout(updatedGridLayout);
      }
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, setGridLayout]);

  useEffect(() => {
    if (isGridLayoutLoaded) {
      if (gridLayout) {
        // set current grid layout from loaded
        setCurrentGridLayout(gridLayout);
      } else {
        // idb is empty, set it with an initial layout
        setGridLayout(generateLayout());
      }
    }
  }, [
    isEditMode,
    gridLayout,
    currentGridLayout,
    setGridLayout,
    isGridLayoutLoaded,
    generateLayout,
  ]);

  useEffect(() => {
    if (
      !isEqual(cameras, currentCameras) ||
      includeBirdseye !== currentIncludeBirdseye
    ) {
      setCurrentCameras(cameras);
      setCurrentIncludeBirdseye(includeBirdseye);

      // set new grid layout in idb
      setGridLayout(generateLayout());
    }
  }, [
    cameras,
    includeBirdseye,
    currentCameras,
    currentIncludeBirdseye,
    setCurrentGridLayout,
    generateLayout,
    setGridLayout,
    isGridLayoutLoaded,
  ]);

  const [marginValue, setMarginValue] = useState(16);

  // calculate margin value for browsers that don't have default font size of 16px
  useLayoutEffect(() => {
    const calculateRemValue = () => {
      const htmlElement = document.documentElement;
      const fontSize = window.getComputedStyle(htmlElement).fontSize;
      setMarginValue(parseFloat(fontSize));
    };

    calculateRemValue();
  }, []);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const [{ width: containerWidth, height: containerHeight }] =
    useResizeObserver(gridContainerRef);

  const hasScrollbar = useMemo(() => {
    return (
      containerHeight &&
      containerRef.current &&
      containerRef.current.offsetHeight <
        (gridContainerRef.current?.scrollHeight ?? 0)
    );
  }, [containerRef, gridContainerRef, containerHeight]);

  const cellHeight = useMemo(() => {
    const aspectRatio = 16 / 9;
    // subtract container margin, 1 camera takes up at least 4 rows
    // account for additional margin on bottom of each row
    return (
      ((containerWidth ?? window.innerWidth) - 2 * marginValue) /
        12 /
        aspectRatio -
      marginValue +
      marginValue / 4
    );
  }, [containerWidth, marginValue]);

  return (
    <>
      {!isGridLayoutLoaded || !currentGridLayout ? (
        <div className="mt-2 px-2 grid grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-2 md:gap-4">
          {includeBirdseye && birdseyeConfig?.enabled && (
            <Skeleton className="size-full rounded-lg md:rounded-2xl" />
          )}
          {cameras.map((camera) => {
            return (
              <Skeleton
                key={camera.name}
                className="aspect-video size-full rounded-lg md:rounded-2xl"
              />
            );
          })}
        </div>
      ) : (
        <div
          className="my-2 px-2 pb-8 no-scrollbar overflow-x-hidden"
          ref={gridContainerRef}
        >
          <ResponsiveGridLayout
            className="grid-layout"
            layouts={{
              lg: currentGridLayout,
              md: currentGridLayout,
              sm: currentGridLayout,
              xs: currentGridLayout,
              xxs: currentGridLayout,
            }}
            rowHeight={cellHeight}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
            margin={[marginValue, marginValue]}
            containerPadding={[0, isEditMode ? 6 : 3]}
            resizeHandles={isEditMode ? ["sw", "nw", "se", "ne"] : []}
            onDragStop={handleLayoutChange}
            onResizeStop={handleLayoutChange}
          >
            {includeBirdseye && birdseyeConfig?.enabled && (
              <BirdseyeLivePlayerGridItem
                key="birdseye"
                className={cn(
                  isEditMode &&
                    "outline outline-2 hover:outline-4 outline-muted-foreground hover:cursor-grab active:cursor-grabbing",
                )}
                birdseyeConfig={birdseyeConfig}
                liveMode={birdseyeConfig.restream ? "mse" : "jsmpeg"}
                onClick={() => onSelectCamera("birdseye")}
              >
                {isEditMode && <CornerCircles />}
              </BirdseyeLivePlayerGridItem>
            )}
            {cameras.map((camera) => {
              let grow;
              const aspectRatio = camera.detect.width / camera.detect.height;
              if (aspectRatio > ASPECT_WIDE_LAYOUT) {
                grow = `aspect-wide w-full`;
              } else if (aspectRatio < ASPECT_VERTICAL_LAYOUT) {
                grow = `aspect-tall h-full`;
              } else {
                grow = "aspect-video";
              }
              return (
                <LivePlayerGridItem
                  key={camera.name}
                  cameraRef={cameraRef}
                  className={cn(
                    "rounded-lg md:rounded-2xl bg-black",
                    grow,
                    isEditMode &&
                      "outline-2 hover:outline-4 outline-muted-foreground hover:cursor-grab active:cursor-grabbing",
                  )}
                  windowVisible={
                    windowVisible && visibleCameras.includes(camera.name)
                  }
                  cameraConfig={camera}
                  preferredLiveMode={isSafari ? "webrtc" : "mse"}
                  onClick={() => {
                    !isEditMode && onSelectCamera(camera.name);
                  }}
                >
                  {isEditMode && <CornerCircles />}
                </LivePlayerGridItem>
              );
            })}
          </ResponsiveGridLayout>
          {isDesktop && (
            <DesktopEditLayoutButton
              isEditMode={isEditMode}
              setIsEditMode={setIsEditMode}
              hasScrollbar={hasScrollbar}
            />
          )}
        </div>
      )}
    </>
  );
}

type DesktopEditLayoutButtonProps = {
  isEditMode?: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  hasScrollbar?: boolean | 0 | null;
};

function DesktopEditLayoutButton({
  isEditMode,
  setIsEditMode,
  hasScrollbar,
}: DesktopEditLayoutButtonProps) {
  return (
    <div className="flex flex-row gap-2 items-center text-primary">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            className={cn(
              "fixed",
              isDesktop && "bottom-12 lg:bottom-9",
              isMobile && "bottom-12 lg:bottom-16",
              hasScrollbar && isDesktop ? "right-6" : "right-1",
              "z-50 h-8 w-8 p-0 rounded-full opacity-30 hover:opacity-100 transition-all duration-300",
            )}
            onClick={() => setIsEditMode((prevIsEditMode) => !prevIsEditMode)}
          >
            {isEditMode ? (
              <IoClose className="size-5" />
            ) : (
              <LuMove className="size-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isEditMode ? "Exit Editing" : "Edit Layout"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function CornerCircles() {
  return (
    <>
      <div className="absolute top-[-4px] left-[-4px] z-50 size-3 p-2 rounded-full bg-primary-variant outline-2 outline-muted text-background pointer-events-none" />
      <div className="absolute top-[-4px] right-[-4px] z-50 size-3 p-2 rounded-full bg-primary-variant outline-2 outline-muted text-background pointer-events-none" />
      <div className="absolute bottom-[-4px] right-[-4px] z-50 size-3 p-2 rounded-full bg-primary-variant outline-2 outline-muted text-background pointer-events-none" />
      <div className="absolute bottom-[-4px] left-[-4px] z-50 size-3 p-2 rounded-full bg-primary-variant outline-2 outline-muted text-background pointer-events-none" />
    </>
  );
}

type BirdseyeLivePlayerGridItemProps = {
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
  birdseyeConfig: BirdseyeConfig;
  liveMode: LivePlayerMode;
  onClick: () => void;
};

const BirdseyeLivePlayerGridItem = React.forwardRef<
  HTMLDivElement,
  BirdseyeLivePlayerGridItemProps
>(
  (
    {
      style,
      className,
      onMouseDown,
      onMouseUp,
      onTouchEnd,
      children,
      birdseyeConfig,
      liveMode,
      onClick,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        style={{ ...style }}
        ref={ref}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        <BirdseyeLivePlayer
          className={className}
          birdseyeConfig={birdseyeConfig}
          liveMode={liveMode}
          onClick={onClick}
        />
        {children}
      </div>
    );
  },
);

type LivePlayerGridItemProps = {
  style?: React.CSSProperties;
  className: string;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
  cameraRef: (node: HTMLElement | null) => void;
  windowVisible: boolean;
  cameraConfig: CameraConfig;
  preferredLiveMode: LivePlayerMode;
  onClick: () => void;
};

const LivePlayerGridItem = React.forwardRef<
  HTMLDivElement,
  LivePlayerGridItemProps
>(
  (
    {
      style,
      className,
      onMouseDown,
      onMouseUp,
      onTouchEnd,
      children,
      cameraRef,
      windowVisible,
      cameraConfig,
      preferredLiveMode,
      onClick,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        style={{ ...style }}
        ref={ref}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        <LivePlayer
          cameraRef={cameraRef}
          className={className}
          windowVisible={windowVisible}
          cameraConfig={cameraConfig}
          preferredLiveMode={preferredLiveMode}
          onClick={onClick}
        />
        {children}
      </div>
    );
  },
);
