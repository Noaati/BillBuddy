import { useState, useMemo } from "react";
import Sidebar from "../components/Sidebar";
import useIsMobile from "../hooks/useIsMobile";
import Modal from "../components/Modal";
import CreateNewGroup from '../components/CreateNewGroup';
import useAccount from "../hooks/useAccount";
import GroupPage from "../components/GroupPage";
import AddExpense from "../components/AddExpense";
import selectGroup from '../assets/selectGroup.png';
import AddPayment from "../components/AddPayment";

export default function Dashboard() {
  const [openModal, setOpenModal] = useState(false);
  const isMobile = useIsMobile(768);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [mobilePanel, setMobilePanel] = useState("sidebar");
  const { account } = useAccount();
  const [modalType, setModalType] = useState(null); 
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preselectedPayeeId, setPreselectedPayeeId] = useState(null);
  const [panel, setPanel] = useState('Expenses');

  let modalContent = null;
  let modalTitle = '';

  if (modalType === 'newGroup') {
    modalContent = (
      <CreateNewGroup
        account={account}
        onSuccess={({ fullGroup }) => {
          setSelectedGroup(fullGroup);
          setOpenModal(false);
          setSidebarRefreshKey(k => k + 1);
          if (isMobile) setMobilePanel('group');
        }}

      />
    );

    modalTitle = 'Create New Group';
  }


  if (modalType === 'addExpense') {
    modalContent = <AddExpense group={selectedGroup} onSuccess={() => {
      setOpenModal(false);
      setRefreshKey(k => k + 1);
      setPanel('Expenses');
    }} />;
    modalTitle = 'Add New Expense';
  }

  if (modalType === 'addPayment') {
    modalContent = <AddPayment group={selectedGroup} initialPayeeId={preselectedPayeeId} onSuccess={() => {
      setOpenModal(false);
      setPreselectedPayeeId(null);
      setRefreshKey(k => k + 1);
      setPanel('Payments');
    }} />;
    modalTitle = 'Add New Payment';
  } 

 function handleSelectGroup(group) {
    setSelectedGroup(group);
    if (isMobile) setMobilePanel("group");
  }

  function handleBackToSidebar() {
    setMobilePanel("sidebar");
  }

  const content = useMemo(() => {
    if (!selectedGroup) {
      return (
        <div style={{ padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <img style={{ padding: 20, width: '120px' }} src={selectGroup} alt="Select a group" />
          Select a group to view expenses
        </div>
      );
    }

  return (
    <div style={{ padding: 20 }}>
      {isMobile && (
        <button
          onClick={handleBackToSidebar}
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #eee",
            background: "white",
            cursor: "pointer"
          }}
        >
          ←
        </button>
      )}
        <div>
          <GroupPage group={selectedGroup}
          key={selectedGroup?.id}
          refreshKey={refreshKey}
          panel={panel}
          onAddPayment={() => {
            setModalType('addPayment');
            setOpenModal(true);
          }}
          onAddExpense={() => {
            setModalType('addExpense');
            setOpenModal(true);
          }} 
          onPayNow={(payeeId) => {
            setPreselectedPayeeId(payeeId);
            setModalType('addPayment');
            setOpenModal(true);
          }}
          />
        </div>
      </div>
    );
  }, [selectedGroup, isMobile, refreshKey, panel]);

  if (isMobile) {
    if (mobilePanel === "sidebar") {
      return (
      <>
        <div style={{ display: "flex", height: "100dvh" }}>
          <Sidebar
            key={sidebarRefreshKey}
            onSelectGroup={handleSelectGroup}
            selectedGroupId={selectedGroup?.id}
            onNewGroup={() => {
              setOpenModal(true);
              setModalType('newGroup');
            }}
            account={account}
          />
        </div>

        <Modal open={openModal} onClose={() => setOpenModal(false)} title={modalTitle}
          content={modalContent}
        />
      </>
      );
    }
    return <div style={{ height: "100dvh" }}>{content}</div>;
  }

  return (
    <>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar key={sidebarRefreshKey} selectedGroupId={selectedGroup?.id} onSelectGroup={handleSelectGroup} onNewGroup={() => { setModalType('newGroup'); setOpenModal(true); }} account={account} />
        <div style={{ flex: 1 }}>{content}</div>
      </div>

      <div>
          <Modal open={openModal} onClose={() => setOpenModal(false)} title={modalTitle}
            content={modalContent}
          />
      </div>
    </>
  );
}
