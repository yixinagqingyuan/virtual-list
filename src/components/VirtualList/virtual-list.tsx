/** @format */

import {
  defineComponent,
  onActivated,
  onBeforeMount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import Virtual from "./virtual";
import { Item, Slot } from "./item";
import { VirtualProps } from "./props";

enum EVENT_TYPE {
  ITEM = "itemResize",
  SLOT = "slotResize",
}

enum SLOT_TYPE {
  HEADER = "thead", // string value also use for aria role attribute
  FOOTER = "tfoot",
}

interface Range {
  start: number;
  end: number;
  padFront: number;
  padBehind: number;
}
// list核心组件
export default defineComponent({
  name: "VirtualList",
  // props 传值
  props: VirtualProps,
  setup(props, { emit, slots, expose }) {
    const isHorizontal = props.direction === "horizontal";
    const directionKey = isHorizontal ? "scrollLeft" : "scrollTop";
    const range = ref<Range | null>(null);
    const root = ref<HTMLElement | null>();
    const shepherd = ref<HTMLDivElement | null>(null);
    let virtual: Virtual;

    /**
     * watch
     */
    watch(
      () => props.dataSources.length,
      () => {
        virtual.updateParam("uniqueIds", getUniqueIdFromDataSources());
        virtual.handleDataSourcesChange();
      }
    );
    watch(
      () => props.keeps,
      (newValue) => {
        virtual.updateParam("keeps", newValue);
        virtual.handleSlotSizeChange();
      }
    );
    watch(
      () => props.start,
      (newValue) => {
        scrollToIndex(newValue);
      }
    );
    watch(
      () => props.offset,
      (newValue) => scrollToOffset(newValue)
    );

    /**
     * methods
     */
    // get item size by id
    const getSize = (id) => {
      return virtual.sizes.get(id);
    };
    const getOffset = () => {
      if (props.pageMode) {
        return (
          document.documentElement[directionKey] || document.body[directionKey]
        );
      } else {
        // 获取距离顶部的距离并且取整数
        return root.value ? Math.ceil(root.value[directionKey]) : 0;
      }
    };
    // 获取视口宽度
    const getClientSize = () => {
      const key = isHorizontal ? "clientWidth" : "clientHeight";
      if (props.pageMode) {
        return document.documentElement[key] || document.body[key];
      } else {
        return root.value ? Math.ceil(root.value[key]) : 0;
      }
    };
    // 获取内容总高度
    const getScrollSize = () => {
      const key = isHorizontal ? "scrollWidth" : "scrollHeight";
      if (props.pageMode) {
        return document.documentElement[key] || document.body[key];
      } else {
        return root.value ? Math.ceil(root.value[key]) : 0;
      }
    };
    const emitEvent = (offset, clientSize, scrollSize, evt) => {
      emit("scroll", evt, virtual.getRange());

      if (
        virtual.isFront() &&
        !!props.dataSources.length &&
        offset - props.topThreshold <= 0
      ) {
        emit("totop");
      } else if (
        virtual.isBehind() &&
        offset + clientSize + props.bottomThreshold >= scrollSize
      ) {
        emit("tobottom");
      }
    };
    // 核心逻辑监听滚动事件
    const onScroll = (evt) => {
      // 获取距离顶部的距离
      const offset = getOffset();
      // 获取视口宽度
      const clientSize = getClientSize();
      // 获取内容总高度
      const scrollSize = getScrollSize();

      // iOS滚动回弹行为会造成方向错误，解决兼容 bug
      if (offset < 0 || offset + clientSize > scrollSize + 1 || !scrollSize) {
        return;
      }
      // 处理滚动事件确定数据
      virtual.handleScroll(offset);
      emitEvent(offset, clientSize, scrollSize, evt);
    };

    const getUniqueIdFromDataSources = () => {
      const { dataKey, dataSources = [] } = props;
      return dataSources.map((dataSource: any) =>
        typeof dataKey === "function"
          ? dataKey(dataSource)
          : dataSource[dataKey]
      );
    };
    const onRangeChanged = (newRange: any) => {
      range.value = newRange;
    };
    // 初始化虚拟滚动
    const installVirtual = () => {
      // 获取虚拟滚动所用实例
      virtual = new Virtual(
        {
          slotHeaderSize: 0,
          slotFooterSize: 0,
          keeps: props.keeps,
          estimateSize: props.estimateSize,
          buffer: Math.round(props.keeps / 3), // 默认保留三分之一，也就是十条之所以保留三分之一，防止他还没划到地方就更改 padding 出现错误
          uniqueIds: getUniqueIdFromDataSources(),
        },
        // 选区改变，重新生成选区
        onRangeChanged
      );
      // 获取选区这一步其实有点多此一举了
      //range.value = virtual.getRange()
    };
    // set current scroll position to a expectant index
    const scrollToIndex = (index: number) => {
      // scroll to bottom
      if (index >= props.dataSources.length - 1) {
        scrollToBottom();
      } else {
        const offset = virtual.getOffset(index);
        scrollToOffset(offset);
      }
    };
    // set current scroll position to a expectant offset
    const scrollToOffset = (offset: number) => {
      if (props.pageMode) {
        document.body[directionKey] = offset;
        document.documentElement[directionKey] = offset;
      } else {
        if (root.value) {
          root.value[directionKey] = offset;
        }
      }
    };
    // get the real render slots based on range data
    // in-place patch strategy will try to reuse components as possible
    // so those components that are reused will not trigger lifecycle mounted
    const getRenderSlots = () => {
      const slots = [];
      const { start, end } = range.value;
      const {
        dataSources,
        dataKey,
        itemClass,
        itemTag,
        itemStyle,
        extraProps,
        dataComponent,
        itemScopedSlots,
      } = props;
      for (let index = start; index <= end; index++) {
        const dataSource = dataSources[index];
        if (dataSource) {
          const uniqueKey =
            typeof dataKey === "function"
              ? dataKey(dataSource)
              : dataSource[dataKey];
          if (typeof uniqueKey === "string" || typeof uniqueKey === "number") {
            slots.push(
              <Item
                index={index}
                tag={itemTag}
                event={EVENT_TYPE.ITEM}
                horizontal={isHorizontal}
                uniqueKey={uniqueKey}
                source={dataSource}
                extraProps={extraProps}
                component={dataComponent}
                scopedSlots={itemScopedSlots}
                style={itemStyle}
                class={`${itemClass}${
                  props.itemClassAdd ? " " + props.itemClassAdd(index) : ""
                }`}
                onItemResize={onItemResized}
              />
            );
          } else {
            console.warn(
              `Cannot get the data-key '${dataKey}' from data-sources.`
            );
          }
        } else {
          console.warn(`Cannot get the index '${index}' from data-sources.`);
        }
      }
      return slots;
    };

    // event called when each item mounted or size changed
    const onItemResized = (id: string, size: number) => {
      virtual.saveSize(id, size);
      emit("resized", id, size);
    };

    // event called when slot mounted or size changed
    const onSlotResized = (type: SLOT_TYPE, size: number, hasInit: boolean) => {
      if (type === SLOT_TYPE.HEADER) {
        virtual.updateParam("slotHeaderSize", size);
      } else if (type === SLOT_TYPE.FOOTER) {
        virtual.updateParam("slotFooterSize", size);
      }

      if (hasInit) {
        virtual.handleSlotSizeChange();
      }
    };

    // set current scroll position to bottom
    const scrollToBottom = () => {
      if (shepherd.value) {
        const offset =
          shepherd.value[isHorizontal ? "offsetLeft" : "offsetTop"];
        scrollToOffset(offset);

        // check if it's really scrolled to the bottom
        // maybe list doesn't render and calculate to last range
        // so we need retry in next event loop until it really at bottom
        setTimeout(() => {
          if (getOffset() + getClientSize() < getScrollSize()) {
            scrollToBottom();
          }
        }, 3);
      }
    };

    // when using page mode we need update slot header size manually
    // taking root offset relative to the browser as slot header size
    const updatePageModeFront = () => {
      if (root.value) {
        const rect = root.value.getBoundingClientRect();
        const { defaultView } = root.value.ownerDocument;
        const offsetFront = isHorizontal
          ? rect.left + defaultView!.pageXOffset
          : rect.top + defaultView!.pageYOffset;
        virtual.updateParam("slotHeaderSize", offsetFront);
      }
    };

    // get the total number of stored (rendered) items
    const getSizes = () => {
      return virtual.sizes.size;
    };

    // 在组件的初始渲染发生之前被调用。
    onBeforeMount(() => {
      // 初始化虚拟滚动
      installVirtual();
    });

    // set back offset when awake from keep-alive
    onActivated(() => {
      scrollToOffset(virtual.offset);
    });

    onMounted(() => {
      // set position
      if (props.start) {
        scrollToIndex(props.start);
      } else if (props.offset) {
        scrollToOffset(props.offset);
      }

      // 如果整个页面滚动，需要绑定下事件
      if (props.pageMode) {
        updatePageModeFront();
        document.addEventListener("scroll", onScroll, {
          passive: false,
        });
      }
    });

    onUnmounted(() => {
      // 销毁虚拟滚动
      virtual.destroy();
      if (props.pageMode) {
        // 销毁滚动事件
        document.removeEventListener("scroll", onScroll);
      }
    });

    // 抛出来给父组件使用
    expose({
      scrollToBottom,
      getSizes,
      getSize,
      getOffset,
      getScrollSize,
      getClientSize,
      scrollToOffset,
      scrollToIndex,
    });

    return () => {
      // 拿到 props
      const {
        pageMode,
        rootTag: RootTag,
        wrapTag: WrapTag,
        wrapClass,
        wrapStyle,
        headerTag,
        headerClass,
        headerStyle,
        footerTag,
        footerClass,
        footerStyle,
      } = props;

      const { padFront, padBehind } = range.value!;
      const paddingStyle = {
        padding: isHorizontal
          ? `0px ${padBehind}px 0px ${padFront}px`
          : `${padFront}px 0px ${padBehind}px`,
      };
      const wrapperStyle = wrapStyle
        ? Object.assign({}, wrapStyle, paddingStyle)
        : paddingStyle;
      const { header, footer } = slots;
      // jsx
      return (
        <RootTag ref={root} onScroll={!pageMode && onScroll}>
          {/* header slot */}
          {header && (
            <Slot
              class={headerClass}
              style={headerStyle}
              tag={headerTag}
              event={EVENT_TYPE.SLOT}
              uniqueKey={SLOT_TYPE.HEADER}
              onSlotResize={onSlotResized}
            >
              {header()}
            </Slot>
          )}

          {/* main list */}
          <WrapTag class={wrapClass} style={wrapperStyle}>
            {getRenderSlots()}
          </WrapTag>

          {/* footer slot */}
          {footer && (
            <Slot
              class={footerClass}
              style={footerStyle}
              tag={footerTag}
              event={EVENT_TYPE.SLOT}
              uniqueKey={SLOT_TYPE.FOOTER}
              onSlotResize={onSlotResized}
            >
              {footer()}
            </Slot>
          )}

          {/* an empty element use to scroll to bottom */}
          <div
            ref={shepherd}
            style={{
              width: isHorizontal ? "0px" : "100%",
              height: isHorizontal ? "100%" : "0px",
            }}
          />
        </RootTag>
      );
    };
  },
});
