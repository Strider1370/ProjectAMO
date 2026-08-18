// 앱 공용 Fluent 진입점(배럴). 앱 코드는 '@fluentui/react-components' 대신 여기서 import한다.
// 이유: 나중에 컴포넌트를 래핑/교체/제약할 때 이 한 파일만 바꾸면 됨(헌법 §0 하이브리드 전략).
// 테마는 main.jsx의 FluentProvider(appLightTheme = 헌법 토큰 브리지)에서 전역 주입됨.
export {
  Button, CompoundButton, ToggleButton, MenuButton, SplitButton,
  Input, Textarea, Field, Dropdown, Option, Combobox, Select, SearchBox, SpinButton,
  Checkbox, Radio, RadioGroup, Switch, Slider,
  TabList, Tab,
  Toolbar, ToolbarButton, ToolbarDivider,
  Accordion, AccordionItem, AccordionHeader, AccordionPanel,
  Card, CardHeader, CardPreview, CardFooter,
  Badge, CounterBadge, PresenceBadge, Avatar, Persona,
  Spinner, ProgressBar, Skeleton, SkeletonItem,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell, createTableColumn,
  Menu, MenuTrigger, MenuList, MenuItem, MenuPopover,
  Popover, PopoverTrigger, PopoverSurface, Tooltip,
  Dialog, DialogTrigger, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
  OverlayDrawer, DrawerHeader, DrawerHeaderTitle, DrawerBody,
  MessageBar, MessageBarBody, MessageBarTitle,
  Tree, TreeItem, TreeItemLayout,
  Link, Divider,
  Text, LargeTitle, Title1, Title2, Title3, Subtitle1, Subtitle2, Body1, Body2, Caption1, Caption2,
  tokens, makeStyles, mergeClasses,
} from '@fluentui/react-components'
// 날짜/시간은 별도 compat 패키지(핵심 패키지엔 없음)
export { DatePicker } from '@fluentui/react-datepicker-compat'
export { TimePicker } from '@fluentui/react-timepicker-compat'
