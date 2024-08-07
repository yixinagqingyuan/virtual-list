/**
 * virtual list core calculating center
 *
 * @format
 */

const DIRECTION_TYPE = {
  FRONT: 'FRONT', // scroll up or left
  BEHIND: 'BEHIND', // scroll down or right
}
const CALC_TYPE = {
  INIT: 'INIT',
  FIXED: 'FIXED', // 固定 item宽度
  DYNAMIC: 'DYNAMIC', // 动态 item 宽度
}
const LEADING_BUFFER = 2
// 虚拟滚动实例本质上就是提供了一些封装方法和初始状态

export default class Virtual {
  constructor(param, callUpdate) {
    // 初始化启动
    this.init(param, callUpdate)
  }

  init(param, callUpdate) {
    // 传入参数
    this.param = param
    // 回调函数
    this.callUpdate = callUpdate

    // 总展示item，注意是一步步的展示的
    this.sizes = new Map()
    // 展示的总高度，为了计算平均值的
    this.firstRangeTotalSize = 0
    // 根据上述变量计算平均高度
    this.firstRangeAverageSize = 0
    // 上一次的滑动到过的index
    this.lastCalcIndex = 0
    // 固定的高度的 item的高度
    this.fixedSizeValue = 0
    // item 类型，是动态高度，还是非动态高度
    this.calcType = CALC_TYPE.INIT

    // 滑动距离，为了算 padding 的大小
    this.offset = 0
    // 滑动方向
    this.direction = ''

    // 创建范围空对象，保存展示的开始展示位置，结束展示位置，
    this.range = Object.create(null)
    // 先初始化一次
    if (param) {
      this.checkRange(0, param.keeps - 1)
    }

    // benchmark test data
    // this.__bsearchCalls = 0
    // this.__getIndexOffsetCalls = 0
  }

  destroy() {
    this.init(null, null)
  }

  // 返回当前渲染范围
  // 其实就是深拷贝
  getRange() {
    const range = Object.create(null)
    range.start = this.range.start
    range.end = this.range.end
    range.padFront = this.range.padFront
    range.padBehind = this.range.padBehind
    return range
  }

  isBehind() {
    return this.direction === DIRECTION_TYPE.BEHIND
  }

  isFront() {
    return this.direction === DIRECTION_TYPE.FRONT
  }

  // 返回起始索引偏移
  getOffset(start) {
    return (
      (start < 1 ? 0 : this.getIndexOffset(start)) + this.param.slotHeaderSize
    )
  }

  updateParam(key, value) {
    if (this.param && key in this.param) {
      // if uniqueIds change, find out deleted id and remove from size map
      if (key === 'uniqueIds') {
        this.sizes.forEach((v, key) => {
          if (!value.includes(key)) {
            this.sizes.delete(key)
          }
        })
      }
      this.param[key] = value
    }
  }

  // 按id保存每个item
  // 当每个 item 被展示的时候，就会初始化 set 进去
  saveSize(id, size) {
    this.sizes.set(id, size)

    //我们假设大小类型在开始时是固定的，并记住第一个大小值
    //如果下次提交保存时没有与此不同的大小值
    //我们认为这是一个固定大小的列表，否则是动态大小列表
    // 他这个套路很巧妙他给每一列的高度判断一下
    // 如果相同那么就默认为是相同的高度，如果不同那么默认为不同的高度
    if (this.calcType === CALC_TYPE.INIT) {
      this.fixedSizeValue = size
      this.calcType = CALC_TYPE.FIXED
    } else if (
      this.calcType === CALC_TYPE.FIXED &&
      this.fixedSizeValue !== size
    ) {
      this.calcType = CALC_TYPE.DYNAMIC
      // it's no use at all
      delete this.fixedSizeValue
    }

    // 仅计算第一个范围内的平均大小
    // 如果是动态高度的情况下
    if (
      this.calcType !== CALC_TYPE.FIXED &&
      typeof this.firstRangeTotalSize !== 'undefined'
    ) {
      // 如果已经获取高度的数据比展示的总数据小的时候才计算
      if (
        this.sizes.size <
        Math.min(this.param.keeps, this.param.uniqueIds.length)
      ) {
        this.firstRangeTotalSize = [...this.sizes.values()].reduce(
          (acc, val) => acc + val,
          0,
        )
        // 计算出来一个平均高度
        this.firstRangeAverageSize = Math.round(
          this.firstRangeTotalSize / this.sizes.size,
        )
      } else {
        // 拿到平均高度了，就干掉总高度
        delete this.firstRangeTotalSize
      }
    }
  }

  // in some special situation (e.g. length change) we need to update in a row
  // try goiong to render next range by a leading buffer according to current direction
  handleDataSourcesChange() {
    let start = this.range.start

    if (this.isFront()) {
      start = start - LEADING_BUFFER
    } else if (this.isBehind()) {
      start = start + LEADING_BUFFER
    }

    start = Math.max(start, 0)

    this.updateRange(this.range.start, this.getEndByStart(start))
  }

  // when slot size change, we also need force update
  handleSlotSizeChange() {
    this.handleDataSourcesChange()
  }

  // 滚动计算范围
  handleScroll(offset) {
    // 计算方向 也就是是朝上还是朝下滑动
    this.direction =
      offset < this.offset ? DIRECTION_TYPE.FRONT : DIRECTION_TYPE.BEHIND
    // 保存当前offset 距离，为了判断下次是朝上还是朝下
    this.offset = offset

    if (!this.param) {
      return
    }

    if (this.direction === DIRECTION_TYPE.FRONT) {
      // 如果是朝上滑动
      this.handleFront()
    } else if (this.direction === DIRECTION_TYPE.BEHIND) {
      // 如果是朝下滑动
      this.handleBehind()
    }
  }

  // ----------- public method end -----------

  handleFront() {
    const overs = this.getScrollOvers()
    // should not change range if start doesn't exceed overs
    if (overs > this.range.start) {
      return
    }

    // move up start by a buffer length, and make sure its safety
    const start = Math.max(overs - this.param.buffer, 0)
    this.checkRange(start, this.getEndByStart(start))
  }

  handleBehind() {
    // 获取偏移量 所对饮的 list
    const overs = this.getScrollOvers()
    // 如果在缓冲区内滚动，范围不应改变 ，range是在每次滑动出缓冲区的时候更改
    if (overs < this.range.start + this.param.buffer) {
      return
    }
    // 也就是当overs 大于当前的缓冲内容了，也就是到头了
    //我们就开始启动检查机制，重新确定range
    // 其实就是开辟新的缓冲区
    this.checkRange(overs, this.getEndByStart(overs))
  }

  // 根据当前滚动偏移量返回传递值
  getScrollOvers() {
    // 如果插槽标头存在，我们需要减去它的大小，为了兼容
    const offset = this.offset - this.param.slotHeaderSize
    if (offset <= 0) {
      return 0
    }

    // 固定高度的 itm 很好办，直接用偏移量除以单独的宽度就行，就能得出挪上去了几个元素
    if (this.isFixedType()) {
      return Math.floor(offset / this.fixedSizeValue)
    }
    // 非固定高度就麻烦了
    let low = 0
    let middle = 0
    let middleOffset = 0
    let high = this.param.uniqueIds.length
    // 接下来就要有一套算法来解决问题了，求偏移了几个
    while (low <= high) {
      // this.__bsearchCalls++
      //他这个算法应该属于二分法，通过二分法去求最接近偏移量的 list条数
      // 获取二分居中内容，其实有可能跟总high 一样
      middle = low + Math.floor((high - low) / 2)
      // 获取居中条数的总偏移量
      middleOffset = this.getIndexOffset(middle)
      // 如果偏移量，等于当前偏移量
      if (middleOffset === offset) {
        // 中间 位置数据返回
        return middle
        // 还是利用二分法去找逐渐缩小距离
      } else if (middleOffset < offset) {
        low = middle + 1
      } else if (middleOffset > offset) {
        high = middle - 1
      }
    }
    // 最后是在没找到，就也是无限接近了
    // 因为如果只有大于才会给 while 干掉
    // 也就是在干掉的一瞬间他一定是最接近 offset 的那个值，并且根据动态高度，所形成的 list 条数
    // 之所以-- 是因为 while不行了，所以，我们要回到他行的时候
    return low > 0 ? --low : 0
  }

  //返回给定索引的滚动偏移量，这里可以进一步提高效率吗？
  //虽然通话频率很高，但它只是数字的叠加
  getIndexOffset(givenIndex) {
    // 如果没有就返回 0 偏移量
    if (!givenIndex) {
      return 0
    }
    // 初始偏移量
    let offset = 0
    let indexSize = 0
    // 遍历元素内容
    for (let index = 0; index < givenIndex; index++) {
      // this.__getIndexOffsetCalls++
      // 获取他们的高度
      indexSize = this.sizes.get(this.param.uniqueIds[index])
      // 获取他准确的偏移量，只有前一部分有后续就没有了，所以就要按照前头计算的平均计算量去计算
      // 后续如果滑动完了，那么就会找到，能事实更正
      offset =
        offset +
        (typeof indexSize === 'number' ? indexSize : this.getEstimateSize())
    }

    // 记住上次计算指标 这里计算是为了后续比较的时候用的
    // 因为有可能往上滑或者往下滑，所以每次要比较一下取最大值
    this.lastCalcIndex = Math.max(this.lastCalcIndex, givenIndex - 1)
    // 或者跟总元素个数比较取最小的也就是 lastCalcIndex 不能比总元素数量小，这个math.min
    // 之所以要取小，是为了兼容， lastCalcIndex 可能大于最大数量的情况
    //console.log(this.lastCalcIndex, this.getLastIndex())
    // 经过实践发现，好像前者永远不会大于后者,这个取值好像没用
    this.lastCalcIndex = Math.min(this.lastCalcIndex, this.getLastIndex())
    return offset
  }

  // is fixed size type
  isFixedType() {
    return this.calcType === CALC_TYPE.FIXED
  }

  // return the real last index
  getLastIndex() {
    return this.param.uniqueIds.length - 1
  }

  //在某些情况下，范围被打破，我们需要纠正它
  //然后决定是否需要更新到下一个范围
  checkRange(start, end) {
    const keeps = this.param.keeps
    const total = this.param.uniqueIds.length

    // 小于keep的数据，全部呈现
    // 就是条数太少了，就没有必要搞烂七八糟的计算了
    if (total <= keeps) {
      start = 0
      end = this.getLastIndex()
    } else if (end - start < keeps - 1) {
      // 如果范围长度小于keeps，则根据end进行校正
      start = end - keeps + 1
    }
    // 如果范围有问题，那么就需要重新更新范围
    if (this.range.start !== start) {
      this.updateRange(start, end)
    }
  }

  // 设置到新范围并重新渲染
  updateRange(start, end) {
    this.range.start = start
    this.range.end = end
    this.range.padFront = this.getPadFront()
    this.range.padBehind = this.getPadBehind()
    // 通知回调函数
    console.log(this.getRange())
    this.callUpdate(this.getRange())
  }

  // 这个其实就是基于他的开始位置，返回一个一定的位置
  getEndByStart(start) {
    const theoryEnd = start + this.param.keeps - 1
    // 也有可能最后算出来的超出了当前的总数据量 ，所以要取小来搞定结束位置
    const truelyEnd = Math.min(theoryEnd, this.getLastIndex())
    return truelyEnd
  }

  // 返回总前偏移
  getPadFront() {
    // 固定高度的
    if (this.isFixedType()) {
      return this.fixedSizeValue * this.range.start
    } else {
      // 非固定高度，在方法中用二分法，获取最接近的
      return this.getIndexOffset(this.range.start)
    }
  }

  // 计算总高度
  getPadBehind() {
    // 获取初始 end
    const end = this.range.end
    // 获取总条数
    const lastIndex = this.getLastIndex()
    // 如果是 fixed大小
    if (this.isFixedType()) {
      return (lastIndex - end) * this.fixedSizeValue
    }

    // 这是非固定高度
    console.log(this.lastCalcIndex, lastIndex)
    if (this.lastCalcIndex === lastIndex) {
      //如果之前滑动到过底部，并且精准的对上过了，则返回精确的偏移量
      // 所谓精准对上了，是在之前获取高度的时候，我已经展示过了所有的精确高度
      // 所以当滑动到过底部的时候，getIndexOffset返回的就会是 精准的offset，因为 之前的 map 里头存了所有的精准高度
      return this.getIndexOffset(lastIndex) - this.getIndexOffset(end)
    } else {
      //如果没有，使用估计值
      return (lastIndex - end) * this.getEstimateSize()
    }
  }

  // 获取项目估计大小，兜底策略，防止高度为空的情况，拿他的默认高度
  getEstimateSize() {
    return this.isFixedType()
      ? this.fixedSizeValue
      : this.firstRangeAverageSize || this.param.estimateSize
  }
}
