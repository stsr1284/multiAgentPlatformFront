import { useEffect, useState } from 'react'
import styled from 'styled-components'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'

type AgentItem = {
  title: string
  description: string
}

type ChatEntry = {
  type: string
  agent: string | null
  message: string
}

function App() {
  const [threadId] = useState(() => uuidv4())
  const [orchestrators, setOrchestrators] = useState<AgentItem[]>([])
  const [mainAgents, setMainAgents] = useState<AgentItem[]>([])
  const [selectedOrchestrator, setSelectedOrchestrator] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [chatLog, setChatLog] = useState<ChatEntry[]>([])
  const [ephemeralMessages, setEphemeralMessages] = useState<{ [agent: string]: string }>({})
  const [interruptPrompt, setInterruptPrompt] = useState<string | null>(null)
  const [interruptInput, setInterruptInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const serverEndpoint = import.meta.env.VITE_URL

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const [orchRes, mainRes] = await Promise.all([
          axios.get(`${serverEndpoint}/orchestration/get_orchestrators`),
          axios.get(`${serverEndpoint}/orchestration/get_agents`),
        ])

        setOrchestrators(orchRes.data)
        setMainAgents(mainRes.data)
      } catch (err) {
        console.error('에이전트 목록을 불러오는 중 오류 발생:', err)
      }
    }

    fetchAgents()
  }, [])

  const toggleAgentSelection = (agent: AgentItem) => {
    setSelectedAgents(prev => prev.includes(agent.title)
      ? prev.filter(a => a !== agent.title)
      : [...prev, agent.title])
  }

  const toggleOrchestratorSelection = (agent: AgentItem) => {
    setSelectedOrchestrator(prev => prev === agent.title ? null : agent.title)
  }

  const handleChatSend = async () => {
      if (messageInput.trim() === '') {
        alert('메시지를 입력해주세요.')
        return
      }
      setIsLoading(true)
      try {
        const response = await fetch(`${serverEndpoint}/orchestration/chat/astream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            thread_id: threadId,
            query: messageInput,
            agent_list: selectedAgents,
            orchestrator_type: selectedOrchestrator || 'testsupervisor3',
          }),
        })
    
        if (!response.body) throw new Error('No response stream')
    
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
        
          let boundary = buffer.lastIndexOf('\n')
          if (boundary !== -1) {
            const completeChunk = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 1)
        
            const parts = completeChunk.split('\n').filter(line => line.trim() !== '')
            for (let i = 0; i < parts.length; i++) {
              try {
                const data = JSON.parse(parts[i])
                const agent = data.agent
                const message = data.message
                const type = data.type
        
                if (type === 'end') {
                  setChatLog(prev => [...prev, { type, agent, message }])
                } else if (type === 'interrupt') {
                  setInterruptPrompt(message)
                } else if (agent && message) {
                  setEphemeralMessages(prev => ({ ...prev, [agent]: message }))
        
                  setTimeout(() => {
                    setEphemeralMessages(prev => {
                      const updated = { ...prev }
                      delete updated[agent]
                      return updated
                    })
                  }, 2000)
                }
              } catch (err) {
                console.error('JSON parse error:', parts[i])
              }
            }
          }
        }
      } catch (err) {
        console.error('채팅 전송 실패:', err)
      } finally {
        setIsLoading(false)
        setMessageInput('')
      }
    }
  
  
    const handleInterruptSubmit = async () => {
      if (!interruptInput.trim()) return
      setInterruptPrompt(null)
      setIsLoading(true)

  
      try {
        const response = await fetch(`${serverEndpoint}/orchestration/chat/astream_resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: threadId,
            query: interruptInput,
          }),
        })
  
        if (!response.body) throw new Error('No response stream')
  
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
  
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
  
          let boundary = buffer.lastIndexOf('\n')
          if (boundary !== -1) {
            const completeChunk = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 1)
  
            const parts = completeChunk.split('\n').filter(line => line.trim() !== '')
            for (let i = 0; i < parts.length; i++) {
              try {
                const data = JSON.parse(parts[i])
                const agent = data.agent
                const message = data.message
                const type = data.type
  
                if (type === 'end') {
                  setChatLog(prev => [...prev, { type, agent, message }])
                } else if (type === 'interrupt') {
                  setInterruptPrompt(message)
                } else if (agent && message) {
                  setEphemeralMessages(prev => ({ ...prev, [agent]: message }))
                }
                setTimeout(() => {
                  setEphemeralMessages(prev => {
                    const updated = { ...prev }
                    delete updated[agent]
                    return updated
                  })
                }, 2000)
              } catch (err) {
                console.error('JSON parse error:', parts[i])
              }
            }
          }
        }
      } catch (err) {
        console.error('astream_resume 실패:', err)
      }finally {
        setIsLoading(false)

      setInterruptInput('')
      }
    }

  return (
    <Wrapper>
      {interruptPrompt && (
        <InterruptInputWrapper>
          <InterruptValue>{interruptPrompt}</InterruptValue>
          <InterruptInput
            type="text"
            placeholder="응답을 입력하세요..."
            value={interruptInput}
            onChange={(e) => setInterruptInput(e.target.value)}
            />
            <InterruptButton onClick={handleInterruptSubmit}>응답</InterruptButton>
        </InterruptInputWrapper>
      )}
      <LeftWrapper />
      <MiddleWrapper>
        <ChatWrapper>
          <SelectedAgentContainer>
            {selectedOrchestrator && (
              <SelectedOrchestratorWrapper>
                <AgentChip style={{ backgroundColor: '#bbb' }}>
                  [Orchestrator] {selectedOrchestrator}
                </AgentChip>
                {ephemeralMessages[selectedOrchestrator] && (
                  <EphemeralMessage>{ephemeralMessages[selectedOrchestrator]}</EphemeralMessage>
                )}
              </SelectedOrchestratorWrapper>
            )}
            {selectedAgents.map((agent, idx) => (
              <SelectedAgentWrapper key={idx}>
                <AgentChip>{agent}</AgentChip>
                {ephemeralMessages[agent] && (
                  <EphemeralMessage>{ephemeralMessages[agent]}</EphemeralMessage>
                )}
              </SelectedAgentWrapper>
            ))}
          </SelectedAgentContainer>
          <ChatContentWrapper>
            {chatLog.map((msg, idx) => (
              <ChatContent key={idx}>{msg.message}</ChatContent>
            ))}
            </ChatContentWrapper>
            {isLoading && <Spinner>응답 생성 중...</Spinner>}
        </ChatWrapper>

        <ChatInputBoxWrapper>
          <ChatInputBox
            type="text"
            placeholder="Type your message here..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />
          <ChatInputBoxButton onClick={handleChatSend} disabled={isLoading}>
            {isLoading ? '...' : `전송`}
          </ChatInputBoxButton>
        </ChatInputBoxWrapper>
      </MiddleWrapper>

      <RightWrapper>
        <AgentListWrapper>
          <OrchestratorListWrapper>
            <OrchestratorListTitle>오케스트레이터 목록</OrchestratorListTitle>
            <OrchestratorList>
              {orchestrators.map((item, idx) => (
                <Item
                  key={idx}
                  onClick={() => toggleOrchestratorSelection(item)}
                  style={{ backgroundColor: selectedOrchestrator === item.title ? '#ccc' : 'transparent' }}
                >
                  <ItemTitle>{item.title}</ItemTitle>
                  <ItemDescription>{item.description}</ItemDescription>
                </Item>
              ))}
            </OrchestratorList>
          </OrchestratorListWrapper>

          <MainAgentListWrapper>
            <MainAgentListTitle>메인 에이전트 목록</MainAgentListTitle>
            <MainAgentList>
            {mainAgents.map((item, idx) => (
              <Item
                key={idx}
                onClick={() => toggleAgentSelection(item)}
                style={{
                  backgroundColor: selectedAgents.some(a => a === item.title) ? '#ccc' : 'transparent'
                }}
              >
                <ItemTitle>{item.title}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
              </Item>
            ))}
            </MainAgentList>
          </MainAgentListWrapper>
        </AgentListWrapper>
      </RightWrapper>
    </Wrapper>
  )
}



const Wrapper = styled.div`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  flex-direction: row;
`

const LeftWrapper = styled.div`
  flex: 1;
  max-width: 100%;
`

const MiddleWrapper = styled.div`
  flex: 0 1 800px;
  width: 100%;
  max-width: 800px;
  display: flex;
  justify-content: between;
  flex-direction: column;
`

const RightWrapper = styled.div`
  flex: 1;
  max-width: 100%;
  display: flex;
  align-items: center;
`

const ChatContentWrapper = styled.div`
  padding: 10px;
  overflow-y: auto;
  max-height: calc(100vh - 180px);
`

const ChatContent = styled.div`
  margin: 5px 0;
`

const ChatWrapper = styled.div` 
  width: 100%;
  height: 100%;
`
const ChatInputBoxWrapper = styled.div`
  position: relative;
  height: 140px;
`

const ChatInputBox = styled.input`
  size: 100%;
  width: 100%;
  height: 55px;
  outline: none;
  border: none;
  border-radius: 30px;
  border: 2px solid #ccc;
  padding: 0 0 0 20px;
  font-size: 18px;
  font-weight: light;
`

const ChatInputBoxButton = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  cursor: pointer;
  width: 42px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background-color: #777;
  color: white;
  font-size: 14px;
  &:hover {
    background-color: #666;
  }
  &:active {
    background-color: #555;
  }
  &:focus {
    outline: none;
  }
`

const AgentListWrapper = styled.div`
  margin-left: 15px;
  width: 250px;
  height: 100%;
  display: flex;
  justify-content: center;
  flex-direction: column;
  gap: 20px;
`

const OrchestratorListWrapper = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 200px;
`

const OrchestratorListTitle = styled.div`
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 5px;
`
  const OrchestratorList = styled.div`
  padding: 0 5px 5px 5px;;
  border-radius: 10px;
  border: 2px solid #ccc;
  min-height: 70px;
  overflow-y: auto;
`
const MainAgentListWrapper = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 200px;
`

const MainAgentListTitle = styled.div`
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 5px;
`
const MainAgentList = styled.div`
  padding: 0 5px 5px 5px;;
  border-radius: 10px;
  border: 2px solid #ccc;
`
const Item = styled.div`
  display:flex;
  margin-top: 3px;
  flex-direction: row;
  justify-content: start;
  overflow: auto;
  padding: 4px 1px 4px 8px;
  border-radius: 5px;
  cursor: pointer;
`
const ItemTitle = styled.div`
  font-size: 18px;
  font-weight: semibold;
  margin-right: 5px;
  color: #333;
`
const ItemDescription = styled.div`
  align-self: center;
  font-size: 14px;
  color: #666;
  overflow: auto;
`

const SelectedOrchestratorWrapper = styled.div`
  position: relative;
`

const SelectedAgentWrapper = styled.div`
  position: relative;
`

const SelectedAgentContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0;
`

const AgentChip = styled.div`
  background-color: #ddd;
  border-radius: 50px;
  padding: 8px 16px;
  font-size: 16px;
  font-weight: bold;
  color: #333;
`

const EphemeralMessage = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border: 1px solid #ccc;
  padding: 5px 10px;
  font-size: 14px;
  z-index: 10;
  max-width: 300px;
`

const InterruptInputWrapper = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 300px;
  zIndex: 999,
`

const InterruptValue = styled.div`
  font-size: 16px;
  color: #333;
`

const InterruptInput = styled.input`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 14px;
`

const InterruptButton = styled.button`
  padding: 10px 20px;
  background-color: #777;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    background-color: #666;
  }
`

const Spinner = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font-size: 20px;
`

export default App
